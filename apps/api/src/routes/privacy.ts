import "../types.js";
import type { FastifyInstance } from "fastify";
import { purgeUserDocuments } from "@sat/db";

/**
 * Privacy / data-subject routes (LFPDPPP, GDPR). Right-to-erasure over the user's
 * RAG memory: hard-deletes every document and its embedding for the caller. Strictly
 * scoped to req.user.userId — a user can only ever erase their own data.
 */
export async function privacyRoutes(app: FastifyInstance) {
  app.delete("/me/memory", { onRequest: [app.authenticate] }, async (req, reply) => {
    const { userId } = req.user;
    if (!userId) return reply.code(401).send({ error: "unauthenticated" });
    const removed = await purgeUserDocuments(userId);
    req.log.info({ userId, removed }, "purged user RAG memory (right-to-erasure)");
    return reply.send({ ok: true, removed });
  });
}
