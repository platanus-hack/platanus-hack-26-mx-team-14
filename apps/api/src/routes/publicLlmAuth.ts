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

const AUTH_SYSTEM = `Eres SATI, un asistente fiscal virtual para el SAT de México.

Para proteger los datos fiscales del usuario, necesitas verificar su identidad antes de continuar.

Pide al usuario su código de identificación de 6 dígitos. El usuario puede verlo en la sección de Configuración de la plataforma SATI.

TU RESPUESTA SE CONVIERTE A VOZ: máximo 2 oraciones cortas, sin markdown ni caracteres especiales.`;

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

    const { messages = [], call } = req.body;
    const callId = call?.id ?? null;

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
          return reply.send(openAiResponse(
            "Ese código no coincide con ninguna cuenta. Por favor verifica tu código en la sección de Configuración de la plataforma SATI.",
          ));
        }

        const credRows = await db()
          .select()
          .from(credentials)
          .where(eq(credentials.userId, user.id))
          .limit(1);
        const cred = credRows[0];

        if (!cred) {
          return reply.send(openAiResponse(
            "Tu cuenta no tiene credenciales del SAT configuradas. Por favor configúralas en la plataforma antes de continuar.",
          ));
        }

        caller = { userId: user.id, credentialId: cred.id, rfc: cred.rfc };
        if (callId) await setCaller(callId, caller);

        return reply.send(openAiResponse(
          `Autenticado. Hola ${user.displayName ?? ""}. ¿En qué te puedo ayudar hoy?`,
        ));
      }

      // Sin código todavía: pedir autenticación
      const authHistory: Anthropic.MessageParam[] = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        system: AUTH_SYSTEM,
        messages: authHistory.length > 0 ? authHistory : [{ role: "user", content: "hola" }],
      });
      const block = res.content.find((c) => c.type === "text");
      const text = block && "text" in block ? block.text : "Por favor dime tu código de identificación de 6 dígitos.";
      return reply.send(openAiResponse(text));
    }

    // ── 2. Loop de agente — copia exacta de /agent/voice-turn ────────────────
    const { userId, credentialId, rfc } = caller;

    const messages2: Anthropic.MessageParam[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    if (messages2.length === 0) {
      return reply.send(openAiResponse("¿En qué te puedo ayudar con tus trámites fiscales?"));
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
      return reply.send(openAiResponse(finalReply || "No pude procesar tu solicitud."));
    } catch (err) {
      req.log.error(err, "publicLlmAuth agent error");
      return reply.send(openAiResponse("Hubo un problema en el servidor. Por favor intenta de nuevo."));
    }
  });
}

function openAiResponse(text: string) {
  return {
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop", index: 0 }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
