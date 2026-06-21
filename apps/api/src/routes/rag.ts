import "../types.js";
import type { FastifyInstance } from "fastify";
import { env } from "@sat/shared";
import { makeAnthropic, PRIMARY_MODEL } from "@sat/agent";
import { embedOne } from "@sat/rag";
import { searchDocuments } from "@sat/db";

const RAG_SYSTEM = `Eres SATI, un asistente fiscal mexicano experto.
El usuario te hace una pregunta sobre sus finanzas o situación fiscal.
Se te proporciona contexto de su historial de facturas y documentos fiscales.
Responde de forma precisa y concisa en español.
Si el contexto no contiene suficiente información para responder con certeza, dilo claramente.
No inventes cifras ni datos. Cita los documentos más relevantes cuando sea útil.`;

export async function ragRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  /**
   * POST /me/rag
   * Pure RAG endpoint: embed the query, vector-search user documents, synthesize with Claude.
   * Returns a focused fiscal answer + the top sources used.
   */
  app.post("/me/rag", { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!anthropic) return reply.code(500).send({ error: "ANTHROPIC_API_KEY not set" });

    const { userId, rfc } = req.user;
    if (!userId) return reply.code(401).send({ error: "unauthenticated" });

    const body = req.body as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return reply.code(400).send({ error: "query is required" });

    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 20);
    const t0 = Date.now();

    // Step 1: Embed the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedOne(query, "query");
    } catch (err) {
      req.log.warn({ err }, "rag: embed failed — returning empty answer");
      return reply.send({ answer: "No pude acceder al motor de búsqueda en este momento.", sources: [] });
    }

    // Step 2: Vector search over user's documents
    const hits = await searchDocuments({
      userId,
      rfc: rfc ?? undefined,
      queryEmbedding,
      limit,
    });

    req.log.info({ query: query.slice(0, 80), hits: hits.length, topScore: hits[0]?.score ?? null, ms: Date.now() - t0 }, "rag: search done");

    if (hits.length === 0) {
      return reply.send({
        answer: "No encontré documentos fiscales relevantes en tu historial para responder esa pregunta.",
        sources: [],
      });
    }

    // Step 3: Build context block from top hits
    const context = hits
      .map((h, i) => `[${i + 1}] ${h.title}\n${h.body}`)
      .join("\n\n");

    // Step 4: Synthesize with Claude
    const message = await anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 1024,
      system: RAG_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Contexto de mis documentos fiscales:\n\n${context}\n\n---\n\nPregunta: ${query}`,
        },
      ],
    });

    const answer = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const sources = hits.map(({ type, title, metadata, createdAt, score }) => ({
      type,
      title,
      metadata,
      createdAt,
      score,
    }));

    req.log.info({ query: query.slice(0, 80), answerLen: answer.length, ms: Date.now() - t0 }, "rag: done");

    return reply.send({ answer, sources });
  });
}
