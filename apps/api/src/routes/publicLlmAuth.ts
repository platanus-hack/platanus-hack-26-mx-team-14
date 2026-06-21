import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import {
  tools,
  SYSTEM_PROMPT,
  PRIMARY_MODEL,
  makeAnthropic,
  createMessageResilient,
} from "@sat/agent";
import { env, idempotencyKey, uuid } from "@sat/shared";
import { eq } from "drizzle-orm";
import { db, users, credentials } from "@sat/db";
import { type ScrapeJob, type SkillName, type SkillResult } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";
import { extractTicket } from "@sat/scraper";
import { resolveCaller, setCaller } from "../caller.js";

type OpenAIMessage = { role: "user" | "assistant" | "system"; content: string };

const TOOL_LABELS: Record<string, string> = {
  getEmitedInvoices: "Consultando facturas emitidas…",
  getReceiptInvoices: "Consultando facturas recibidas…",
  generateCSF: "Descargando Constancia de Situación Fiscal…",
  generateInvoice: "Preparando factura…",
  extractTicketData: "Extrayendo datos del ticket…",
};


function extractCode(text: string): string | null {
  const match = text.replace(/[\s\-]/g, "").match(/(\d{6})/);
  return match?.[1] ?? null;
}

/**
 * POST /public/voice/llm-auth/chat/completions
 *
 * Custom LLM endpoint para VAPI con autenticación por código de identificación.
 * Es una copia fiel de /agent/voice-turn adaptada al formato OpenAI que espera VAPI.
 *
 * Flujo:
 *  1. VAPI llama este endpoint con el historial de mensajes
 *  2. Si el usuario no está autenticado, SATI pide el código de 6 dígitos
 *  3. El código se valida → se guarda callId → usuario en Redis (TTL 1 h)
 *  4. A partir de ahí corre el mismo loop de agente que /agent/voice-turn:
 *     - PRIMARY_MODEL con thinking adaptativo
 *     - Hasta 6 turnos de tool use
 *     - extractTicketData inline, resto vía BullMQ
 *
 * En VAPI: configura este endpoint como Custom LLM provider.
 * URL: https://<tu-api>/public/voice/llm-auth/chat/completions
 */
export async function publicLlmAuthRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  app.post<{
    Body: {
      messages: OpenAIMessage[];
      stream?: boolean;
      call?: { id?: string };
    };
  }>("/public/voice/llm-auth/chat/completions", async (req, reply) => {
    if (!anthropic) return reply.code(503).send({ error: "ANTHROPIC_API_KEY not set" });

    const { messages = [], call, stream = false } = req.body;
    const callId = call?.id ?? null;

    // Handles both streaming (SSE) and non-streaming responses for Vapi compatibility.
    const sendReply = (text: string) => {
      if (!stream) return reply.send(openAiResponse(text));
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      const chunk = JSON.stringify({ choices: [{ delta: { role: "assistant", content: text }, finish_reason: null, index: 0 }] });
      const done  = JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] });
      reply.raw.write(`data: ${chunk}\n\n`);
      reply.raw.write(`data: ${done}\n\n`);
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    };

    // ── 1. Verificar / establecer autenticación ───────────────────────────────
    let caller = callId ? await resolveCaller(callId) : null;

    if (!caller) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const code = lastUserMsg ? extractCode(lastUserMsg.content) : null;

      if (code) {
        const userRows = await db()
          .select()
          .from(users)
          .where(eq(users.identificationCode, code))
          .limit(1);
        const user = userRows[0];

        if (!user) {
          return sendReply("Ese código no coincide con ninguna cuenta. Por favor verifica tu código en la sección de Configuración de la plataforma SATI.");
        }

        const credRows = await db()
          .select()
          .from(credentials)
          .where(eq(credentials.userId, user.id))
          .limit(1);
        const cred = credRows[0];

        if (!cred) {
          return sendReply("Tu cuenta no tiene credenciales del SAT configuradas. Por favor configúralas en la plataforma antes de continuar.");
        }

        caller = { userId: user.id, credentialId: cred.id, rfc: cred.rfc };
        if (callId) await setCaller(callId, caller);

        return sendReply(`Autenticado. Hola ${user.displayName ?? ""}. ¿En qué te puedo ayudar hoy?`);
      }

      // Sin código todavía: pedir el código con mensaje fijo (evita que Claude invente contexto del SAT)
      return sendReply("Hola, soy SATI. Por favor dime tu código de identificación de 6 dígitos.");
    }

    // ── 2. Loop de agente — copia exacta de /agent/voice-turn ────────────────
    const { userId, credentialId, rfc } = caller;

    const allMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Vapi manda el historial completo incluyendo el intercambio de auth ("103378" + "Autenticado...").
    // Solo pasamos al agente los mensajes POSTERIORES al mensaje "Autenticado" para evitar que
    // Claude intente procesar el código como una tarea y entre en ciclos.
    const authIdx = allMessages.findLastIndex(
      (m) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith("Autenticado"),
    );
    const messages2 = authIdx >= 0 ? allMessages.slice(authIdx + 1) : allMessages;

    // Si no hay mensajes de usuario después del auth, Vapi aún no recibió respuesta nueva.
    if (messages2.length === 0 || messages2.at(-1)?.role !== "user") {
      return sendReply("¿En qué te puedo ayudar con tus trámites fiscales?");
    }

    let lastSkillResult: SkillResult | null = null;
    let finalReply = "";

    try {
      for (let i = 0; i < 6; i++) {
        const res = await createMessageResilient(
          anthropic,
          {
            model: PRIMARY_MODEL,
            max_tokens: 4096,
            thinking: { type: "adaptive" },
            system: SYSTEM_PROMPT,
            tools,
            messages: messages2,
          },
          req.log,
        );
        messages2.push({ role: "assistant", content: res.content });

        if (res.stop_reason !== "tool_use") {
          const textBlock = res.content.find((c) => c.type === "text");
          finalReply = textBlock && "text" in textBlock ? textBlock.text : "";
          break;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;

          req.log.info({ tool: block.name, label: TOOL_LABELS[block.name] }, "tool call");

          const correlationId = uuid();

          try {
            let result: SkillResult;

            if (block.name === "extractTicketData") {
              // Lightweight: ejecutar inline sin BullMQ
              const input = block.input as { imageBase64: string; imageMediaType: string };
              const extraction = await extractTicket(input.imageBase64, input.imageMediaType, correlationId);
              result = { skill: "extractTicket", extraction };
            } else {
              // Heavy: despachar vía BullMQ
              const job: ScrapeJob = {
                skill: block.name as SkillName,
                correlationId,
                idempotencyKey: idempotencyKey({ s: block.name, ...(block.input as object), c: correlationId }),
                userId: userId ?? "",
                credentialId: credentialId ?? "",
                rfc: rfc ?? "",
                input: block.input as Record<string, unknown>,
              };
              result = await runSkillViaQueue(job);
            }

            lastSkillResult = result;
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
        messages2.push({ role: "user", content: toolResults });
      }

      req.log.info({ skillResult: lastSkillResult?.skill }, "agent turn done");
      return sendReply(finalReply || "No pude procesar tu solicitud.");
    } catch (err) {
      req.log.error(err, "publicLlmAuth agent error");
      return sendReply("Hubo un problema en el servidor. Por favor intenta de nuevo.");
    }
  });
}

function openAiResponse(text: string) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "sati-llm",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
