import "../types.js";
import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { env, idempotencyKey, uuid } from "@sat/shared";
import {
  tools,
  SYSTEM_PROMPT,
  PRIMARY_MODEL,
  makeAnthropic,
  isOverloaded,
  createMessageResilient,
} from "@sat/agent";
import { type ScrapeJob, type SkillName, type SkillResult } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";
import {
  persistToolResult,
  runSearchHistory,
  runTopCounterparties,
  logUserQuery,
  lastUserText,
} from "../ragMemory.js";

export async function agentRoutes(app: FastifyInstance) {
  // Client tuned for outages: SDK retries 429/500/529 with backoff (maxRetries: 5).
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  app.post("/agent/turn", { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!anthropic) return reply.code(500).send({ error: "ANTHROPIC_API_KEY not set" });
    const { userId, credentialId, rfc } = req.user;
    const b = req.body as {
      messages: Anthropic.MessageParam[];
    };

    const messages = [...(b.messages ?? [])];
    const turnLog = req.log.child({ userId, rfc, op: "agent.turn" });
    turnLog.info({ inboundMessages: messages.length }, "agent turn started");

    // Log the user's NL query (last user turn) for the top-queries suggestions.
    logUserQuery({ userId: userId ?? "", rfc: rfc ?? "" }, lastUserText(messages), turnLog);
    try {
      for (let i = 0; i < 6; i++) {
        // Resilient call: retries (SDK) → fallback to Sonnet on overload (helper).
        const t0 = Date.now();
        const res = await createMessageResilient(
          anthropic,
          {
            model: PRIMARY_MODEL,
            max_tokens: 4096,
            thinking: { type: "adaptive" },
            system: SYSTEM_PROMPT,
            tools,
            messages,
          },
          req.log,
        );
        turnLog.info(
          {
            iter: i,
            model: res.model,
            stopReason: res.stop_reason,
            inputTokens: res.usage?.input_tokens,
            outputTokens: res.usage?.output_tokens,
            ms: Date.now() - t0,
          },
          "model response",
        );
        messages.push({ role: "assistant", content: res.content });

        if (res.stop_reason !== "tool_use") {
          const text = res.content.find((c) => c.type === "text");
          turnLog.info({ iter: i }, "agent turn complete (no tool use)");
          return reply.send({ reply: text && "text" in text ? text.text : "", messages });
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          const correlationId = uuid();
          // Log the tool call (input keys only — never the values, which may carry PII).
          const toolLog = turnLog.child({ tool: block.name, correlationId, op: "agent.tool" });
          toolLog.info({ inputKeys: Object.keys((block.input as object) ?? {}) }, "tool call started");

          // RAG / KG-lite reads: answered inline from this user's data — no SAT, no queue.
          if (block.name === "searchHistory" || block.name === "getTopCounterparties") {
            const scope = { userId: userId ?? "", rfc: rfc ?? "" };
            const input = block.input as Record<string, unknown>;
            try {
              const out =
                block.name === "searchHistory"
                  ? await runSearchHistory(scope, input, toolLog)
                  : await runTopCounterparties(scope, input, toolLog);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(out),
              });
            } catch (err) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error: ${(err as Error).message}`,
                is_error: true,
              });
            }
            continue;
          }

          const job: ScrapeJob = {
            skill: block.name as SkillName,
            correlationId,
            idempotencyKey: idempotencyKey({ s: block.name, ...(block.input as object), c: correlationId }),
            userId: userId ?? "",
            credentialId: credentialId ?? "",
            rfc: rfc ?? "",
            input: block.input as Record<string, unknown>,
          };
          const tTool = Date.now();
          try {
            const result = await runSkillViaQueue(job);
            toolLog.info({ ms: Date.now() - tTool, ok: true }, "tool call finished");
            // Write path: persist the result into RAG memory (fire-and-forget).
            persistToolResult({ userId: userId ?? "", rfc: rfc ?? "" }, result as SkillResult, toolLog);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            toolLog.error(
              { ms: Date.now() - tTool, err: (err as Error).message },
              "tool call failed",
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error: ${(err as Error).message}`,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: toolResults });
      }

      turnLog.warn("agent turn hit max iterations");
      return reply.send({ reply: "Se alcanzó el límite de iteraciones.", messages });
    } catch (err) {
      // Both primary and fallback model are unavailable → degrade gracefully.
      if (isOverloaded(err)) {
        req.log.error({ err }, "Claude overloaded (529) — primary + fallback exhausted");
        return reply
          .code(503)
          .header("Retry-After", "15")
          .send({
            error: "model_overloaded",
            reply:
              "El servicio de IA está saturado en este momento. Intenta de nuevo en unos segundos.",
          });
      }
      throw err;
    }
  });
}
