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
import { type ScrapeJob, type SkillName } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";

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
    try {
      for (let i = 0; i < 6; i++) {
        // Resilient call: retries (SDK) → fallback to Sonnet on overload (helper).
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
        messages.push({ role: "assistant", content: res.content });

        if (res.stop_reason !== "tool_use") {
          const text = res.content.find((c) => c.type === "text");
          return reply.send({ reply: text && "text" in text ? text.text : "", messages });
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          const correlationId = uuid();
          const job: ScrapeJob = {
            skill: block.name as SkillName,
            correlationId,
            idempotencyKey: idempotencyKey({ s: block.name, ...(block.input as object), c: correlationId }),
            userId: userId ?? "",
            credentialId: credentialId ?? "",
            rfc: rfc ?? "",
            input: block.input as Record<string, unknown>,
          };
          try {
            const result = await runSkillViaQueue(job);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
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
