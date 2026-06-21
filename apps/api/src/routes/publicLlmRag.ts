import type { FastifyInstance } from "fastify";
import { env } from "@sat/shared";
import { makeAnthropic, PRIMARY_MODEL } from "@sat/agent";
import { embedOne } from "@sat/rag";
import { db, users, credentials, searchDocuments, fiscalProfile } from "@sat/db";
import { eq } from "drizzle-orm";
import { resolveCaller, setCaller } from "../caller.js";

type OpenAIMessage = { role: "user" | "assistant" | "system"; content: string };

const RAG_SYSTEM = `Eres SATI, un asistente fiscal mexicano.
Tienes acceso al historial de facturas y documentos fiscales del usuario.
Responde de forma concisa y directa, en español, para una conversación de voz.
Usa oraciones cortas. No uses listas largas ni formatos complejos.
Cita cifras concretas cuando las tengas. Si no tienes información suficiente, dilo claramente.`;

function extractCode(text: string): string | null {
  const match = text.replace(/[\s\-]/g, "").match(/(\d{6})/);
  return match?.[1] ?? null;
}

function openAiResponse(text: string) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "sati-rag",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * POST /public/voice/llm-rag/chat/completions
 *
 * VAPI-compatible OpenAI Chat Completions endpoint — 100% RAG, no agent tool loop.
 *
 * Flow:
 *  1. No auth → ask for 6-digit identification code
 *  2. Code valid → authenticate → return a RAG fiscal summary to open the conversation
 *  3. Subsequent turns → embed query → pgvector search → Claude synthesize → answer
 *
 * In VAPI: set this as your Custom LLM provider URL.
 */
export async function publicLlmRagRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  app.post<{
    Body: { messages: OpenAIMessage[]; stream?: boolean; call?: { id?: string } };
  }>("/public/voice/llm-rag/chat/completions", async (req, reply) => {
    if (!anthropic) return reply.code(503).send({ error: "ANTHROPIC_API_KEY not set" });

    const { messages = [], call, stream = false } = req.body;
    const callId = call?.id ?? null;

    const sendReply = (text: string) => {
      if (!stream) return reply.send(openAiResponse(text));

      // Hijack so Fastify doesn't try to send its own response after we close raw
      reply.hijack();
      const base = { id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "sati-rag" };
      const chunk = JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] });
      const done  = JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      reply.raw.write(`data: ${chunk}\n\n`);
      reply.raw.write(`data: ${done}\n\n`);
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    };

    // ── 1. Auth: resolve existing session or find code in messages ────────────
    let caller = callId ? await resolveCaller(callId).catch(() => null) : null;

    if (!caller) {
      const code = [...messages]
        .reverse()
        .filter((m) => m.role === "user")
        .map((m) => extractCode(m.content))
        .find((c) => c !== null) ?? null;

      if (!code) return sendReply("Por favor dime tus seis dígitos de identificación.");

      const [user] = await db().select().from(users).where(eq(users.identificationCode, code)).limit(1);
      if (!user) return sendReply("Código incorrecto. Por favor verifica tus seis dígitos.");

      const [cred] = await db().select().from(credentials).where(eq(credentials.userId, user.id)).limit(1);
      if (!cred) return sendReply("Tu cuenta no tiene credenciales del SAT configuradas.");

      caller = { userId: user.id, credentialId: cred.id, rfc: cred.rfc };
      if (callId) await setCaller(callId, caller).catch(() => {});

      // First time: greet + deliver RAG fiscal summary
      const alreadyAuthed = messages.some(
        (m) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith("Autenticado"),
      );
      if (!alreadyAuthed) {
        const summary = await buildFiscalSummary(caller.userId, caller.rfc, user.displayName ?? "");
        return sendReply(summary);
      }
    }

    // ── 2. Resolve the user's latest question ─────────────────────────────────
    // Strip everything before the last "Autenticado" assistant message.
    const allMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
    const authIdx = allMessages.findLastIndex(
      (m) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith("Autenticado"),
    );
    const dialogue = authIdx >= 0 ? allMessages.slice(authIdx + 1) : allMessages;

    if (dialogue.length === 0 || dialogue.at(-1)?.role !== "user") {
      return sendReply("¿En qué te puedo ayudar con tus finanzas o trámites fiscales?");
    }

    const query = dialogue.at(-1)!.content.trim();

    // ── 3. Pure RAG answer ────────────────────────────────────────────────────
    try {
      const answer = await ragAnswer(
        anthropic,
        caller.userId,
        caller.rfc,
        query,
        dialogue.slice(0, -1), // conversation history (excluding the current question)
      );
      return sendReply(answer);
    } catch (err) {
      req.log.error(err, "publicLlmRag: ragAnswer failed");
      return sendReply("Hubo un problema consultando tu información. Por favor intenta de nuevo.");
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a brief fiscal summary to open the conversation after auth.
 * Pulls from the user's stored documents via RAG + fiscal profile.
 */
async function buildFiscalSummary(userId: string, rfc: string, name: string): Promise<string> {
  try {
    // Embed a broad summary query
    const [profileData, queryEmbedding] = await Promise.all([
      fiscalProfile(userId, rfc),
      embedOne("resumen fiscal facturas emitidas recibidas balance situación régimen", "query"),
    ]);

    const hits = await searchDocuments({ userId, rfc, queryEmbedding, limit: 6 });

    const context = hits.map(h => h.body).join("\n\n");

    const profileLine = profileData?.regimenFiscal?.length
      ? `Régimen: ${profileData.regimenFiscal.join(", ")}.`
      : "";

    if (!context && !profileLine) {
      return `Autenticado. Hola ${name}. Aún no tienes documentos fiscales registrados. ¿En qué te puedo ayudar?`;
    }

    // Let Claude build a concise voice-friendly opening summary
    const res = await buildFiscalSummaryWithClaude(name, profileLine, context);
    return res;
  } catch {
    return `Autenticado. Hola ${name}. ¿En qué te puedo ayudar hoy con tus finanzas?`;
  }
}

async function buildFiscalSummaryWithClaude(
  name: string,
  profileLine: string,
  context: string,
): Promise<string> {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;
  if (!anthropic) return `Autenticado. Hola ${name}. ¿En qué te puedo ayudar hoy?`;

  const res = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 300,
    system: `Eres SATI. El usuario acaba de autenticarse por teléfono. Da un saludo breve y un resumen rápido de su situación fiscal en 2-3 oraciones cortas, ideal para voz. ${profileLine ? profileLine : ""} No uses listas. No uses markdown. Habla directo.`,
    messages: [
      {
        role: "user",
        content: `Mi nombre es ${name}. Aquí está mi información fiscal más reciente:\n\n${context}\n\nDame un saludo y resumen breve para iniciar la conversación.`,
      },
    ],
  });

  const text = res.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  // Prefix ensures alreadyAuthed detection works on subsequent turns
  const body = text || `Hola ${name}. ¿En qué te puedo ayudar hoy?`;
  return body.startsWith("Autenticado") ? body : `Autenticado. ${body}`;
}

/**
 * Answer any fiscal question using pure RAG: embed → vector search → Claude synthesize.
 * Includes the last few dialogue turns as context for follow-up questions.
 */
async function ragAnswer(
  anthropic: ReturnType<typeof makeAnthropic>,
  userId: string,
  rfc: string,
  query: string,
  history: OpenAIMessage[],
): Promise<string> {
  const [queryEmbedding] = await Promise.all([embedOne(query, "query")]);

  const hits = await searchDocuments({ userId, rfc, queryEmbedding, limit: 8 });

  if (hits.length === 0) {
    return "No encontré información relevante en tu historial fiscal para responder esa pregunta.";
  }

  const context = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.body}`).join("\n\n");

  // Include last 3 turns of dialogue for follow-up context
  const recentHistory = history.slice(-6);
  const historyText = recentHistory.length
    ? recentHistory.map(m => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`).join("\n")
    : "";

  const userContent = historyText
    ? `Conversación previa:\n${historyText}\n\nContexto de mis documentos fiscales:\n${context}\n\n---\n\nPregunta: ${query}`
    : `Contexto de mis documentos fiscales:\n${context}\n\n---\n\nPregunta: ${query}`;

  const res = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 512,
    system: RAG_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const answer = res.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  return answer || "No pude generar una respuesta. Por favor reformula tu pregunta.";
}
