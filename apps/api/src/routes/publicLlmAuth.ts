import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { makeAnthropic, SYSTEM_PROMPT, tools, createMessageResilient } from "@sat/agent";
import { env, idempotencyKey, uuid } from "@sat/shared";
import { eq } from "drizzle-orm";
import { db, users, credentials } from "@sat/db";
import { type ScrapeJob, type SkillName } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";
import { resolveCaller, setCaller } from "../caller.js";

type OpenAIMessage = { role: "user" | "assistant" | "system"; content: string };

const AUTH_PROMPT = `Eres SATI, un asistente fiscal virtual para el SAT de México.

Para proteger los datos fiscales del usuario, necesitas verificar su identidad antes de continuar.

Pide al usuario su código de identificación de 6 dígitos. El usuario puede verlo en la sección de Configuración de la plataforma SATI.

Cuando el usuario diga un número de 6 dígitos, úsalo tal como lo dijo (sin espacios ni guiones).

TU RESPUESTA SE CONVIERTE A VOZ: máximo 2 oraciones cortas, sin markdown ni caracteres especiales.`;

const AUTHENTICATED_SYSTEM = `${SYSTEM_PROMPT}

El usuario ya fue autenticado y tiene acceso a sus datos fiscales reales en el SAT.
TU RESPUESTA SE CONVIERTE A VOZ: máximo 3 oraciones cortas y directas, sin markdown ni caracteres especiales.`;

function extractCode(text: string): string | null {
  const match = text.replace(/\s/g, "").match(/\b(\d{6})\b/);
  return match?.[1] ?? null;
}

/**
 * POST /public/voice/llm-auth/chat/completions
 *
 * Custom LLM endpoint para VAPI con autenticación por código.
 * - Pide al usuario su código de 6 dígitos al inicio de la llamada
 * - Valida el código contra la base de datos
 * - Una vez autenticado, accede al RAG real del usuario
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
    if (!anthropic) {
      return reply.code(503).send({ error: "IA no disponible" });
    }

    const { messages = [], stream = false, call } = req.body;
    const callId = call?.id ?? null;

    // ── Verificar si ya está autenticado ─────────────────────────────────────
    let caller = (callId !== null) ? await resolveCaller(callId) : null;

    // ── Si no está autenticado, intentar autenticar ───────────────────────────
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

        if (user) {
          const credRows = await db()
            .select()
            .from(credentials)
            .where(eq(credentials.userId, user.id))
            .limit(1);
          const cred = credRows[0];

          if (cred) {
            caller = { userId: user.id, credentialId: cred.id, rfc: cred.rfc };
            if (callId !== null) await setCaller(callId, caller);
            const replyText = `Autenticado. Hola ${user.displayName ?? ""}. ¿En qué te puedo ayudar hoy?`;
            return reply.send(openAiResponse(replyText));
          }
        }

        // Código incorrecto o sin credenciales
        const replyText = code
          ? "Ese código no coincide con ninguna cuenta. Por favor verifica tu código en la plataforma SATI e inténtalo de nuevo."
          : "No pude escuchar tu código. Por favor dímelo de nuevo.";
        return reply.send(openAiResponse(replyText));
      }

      // Sin código en el mensaje: pedir autenticación
      const authMessages = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      if (stream) {
        return streamResponse(reply, anthropic, AUTH_PROMPT, authMessages);
      }

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 120,
        system: AUTH_PROMPT,
        messages: authMessages.length > 0 ? authMessages : [{ role: "user", content: "hola" }],
      });
      const block = response.content.find((c) => c.type === "text");
      const text = block && "text" in block ? block.text : "Por favor dime tu código de identificación.";
      return reply.send(openAiResponse(text));
    }

    // ── Usuario autenticado: agente SAT completo ──────────────────────────────
    const history: Anthropic.MessageParam[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    if (history.length === 0) {
      return reply.send(openAiResponse("¿En qué te puedo ayudar con tus trámites fiscales?"));
    }

    try {
      // Agentic loop con herramientas SAT (máx 4 turnos para tool use)
      let currentMessages: Anthropic.MessageParam[] = [...history];
      let finalText = "";

      for (let turn = 0; turn < 4; turn++) {
        const res = await createMessageResilient(anthropic, {
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: AUTHENTICATED_SYSTEM,
          tools: tools as Parameters<typeof anthropic.messages.create>[0]["tools"],
          messages: currentMessages,
        });

        const toolUseBlock = res.content.find((b) => b.type === "tool_use");
        const textBlock = res.content.find((b) => b.type === "text");

        if (!toolUseBlock || res.stop_reason === "end_turn") {
          finalText = textBlock && "text" in textBlock ? textBlock.text : "No pude procesar tu solicitud.";
          break;
        }

        // Ejecutar skill vía cola
        const toolUse = toolUseBlock as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
        const correlationId = uuid();
        const job: ScrapeJob = {
          skill: toolUse.name as SkillName,
          correlationId,
          idempotencyKey: idempotencyKey({ s: toolUse.name, ...toolUse.input, c: correlationId }),
          userId: caller.userId,
          credentialId: caller.credentialId,
          rfc: caller.rfc,
          input: toolUse.input,
        };

        let toolResult: string;
        try {
          const result = await runSkillViaQueue(job);
          toolResult = JSON.stringify(result);
        } catch (err) {
          toolResult = `Error: ${(err as Error).message}`;
        }

        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: res.content } as Anthropic.MessageParam,
          {
            role: "user" as const,
            content: [{ type: "tool_result" as const, tool_use_id: toolUse.id, content: toolResult }],
          } as Anthropic.MessageParam,
        ];
      }

      if (!finalText) {
        finalText = "No pude completar la consulta. Intenta de nuevo.";
      }

      if (stream) {
        return streamResponse(reply, anthropic, AUTHENTICATED_SYSTEM, history);
      }

      return reply.send(openAiResponse(finalText));
    } catch (err) {
      return reply.send(openAiResponse(`Hubo un problema: ${(err as Error).message}`));
    }
  });
}

function openAiResponse(text: string) {
  return {
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop", index: 0 }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function streamResponse(
  reply: import("fastify").FastifyReply,
  anthropic: ReturnType<typeof makeAnthropic>,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
) {
  reply
    .header("Content-Type", "text/event-stream; charset=utf-8")
    .header("Cache-Control", "no-cache")
    .header("Connection", "keep-alive");

  const safeMessages: Anthropic.MessageParam[] = messages.length > 0 ? messages : [{ role: "user" as const, content: "hola" }];

  const claudeStream = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: systemPrompt,
    messages: safeMessages,
    stream: true,
  });

  const send = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

  for await (const event of claudeStream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      send({ choices: [{ delta: { content: event.delta.text, role: "assistant" }, index: 0 }] });
    }
  }

  send({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] });
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}
