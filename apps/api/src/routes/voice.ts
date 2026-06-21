import type { FastifyInstance } from "fastify";
import { idempotencyKey, uuid } from "@sat/shared";
import { type ScrapeJob, type SkillName, SKILL_NAMES } from "@sat/events";
import { makeVoiceProvider } from "@sat/voice";
import { eq } from "drizzle-orm";
import { db, users, credentials } from "@sat/db";
import { runSkillViaQueue } from "../queue.js";
import { resolveCaller, setCaller } from "../caller.js";

export async function voiceRoutes(app: FastifyInstance) {

  /**
   * POST /voice/:provider/webhook  — endpoint original, sin cambios.
   * Usa DEMO_USER_ID / DEMO_CREDENTIAL_ID / DEMO_RFC del entorno.
   */
  app.post("/voice/:provider/webhook", async (req, reply) => {
    const provider = makeVoiceProvider(
      (req.params as { provider: "vapi" | "elevenlabs" }).provider,
    );

    const raw = JSON.stringify(req.body ?? {});
    if (!provider.verify(req.headers as Record<string, string | undefined>, raw)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    const parsed = provider.parseWebhook(req.body);
    if (parsed.kind !== "tool_call" || !parsed.toolCall) {
      return reply.send({ ok: true });
    }

    const { toolCall } = parsed;
    if (!SKILL_NAMES.includes(toolCall.skill as SkillName)) {
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: `No conozco la acción ${toolCall.skill}.`,
        }),
      );
    }

    const caller = {
      userId: process.env.DEMO_USER_ID ?? "demo-user",
      credentialId: process.env.DEMO_CREDENTIAL_ID ?? "demo-credential",
      rfc: process.env.DEMO_RFC ?? "XAXX010101000",
    };

    const correlationId = uuid();
    const job: ScrapeJob = {
      skill: toolCall.skill as SkillName,
      correlationId,
      idempotencyKey: idempotencyKey({ s: toolCall.skill, ...toolCall.args, c: correlationId }),
      userId: caller.userId,
      credentialId: caller.credentialId,
      rfc: caller.rfc,
      input: toolCall.args,
    };

    try {
      const result = await runSkillViaQueue(job);
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: speak(result),
          data: result,
        }),
      );
    } catch (err) {
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: `No pude completar la acción: ${(err as Error).message}`,
        }),
      );
    }
  });

  /**
   * POST /voice/:provider/webhook-auth  — endpoint nuevo con autenticación por código.
   *
   * Flujo:
   *  1. El asistente VAPI llama la herramienta "authenticate" con { code: "123456" }
   *  2. Se valida el código, se guarda callId → usuario en Redis (TTL 1 h)
   *  3. Las siguientes tool-calls SAT usan ese usuario autenticado
   *
   * Herramienta a registrar en VAPI: "authenticate", parámetro: code (string)
   */
  app.post("/voice/:provider/webhook-auth", async (req, reply) => {
    const provider = makeVoiceProvider(
      (req.params as { provider: "vapi" | "elevenlabs" }).provider,
    );

    const raw = JSON.stringify(req.body ?? {});
    if (!provider.verify(req.headers as Record<string, string | undefined>, raw)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    const parsed = provider.parseWebhook(req.body);
    if (parsed.kind !== "tool_call" || !parsed.toolCall) {
      return reply.send({ ok: true });
    }

    const { toolCall } = parsed;

    // ── Herramienta de autenticación ─────────────────────────────────────────
    if (toolCall.skill === "authenticate") {
      const code = (toolCall.args as { code?: string }).code?.trim();
      if (!code) {
        return reply.send(
          provider.formatToolResult({
            id: toolCall.id,
            speech: "No recibí ningún código. Por favor dímelo de nuevo.",
          }),
        );
      }

      const userRows = await db()
        .select()
        .from(users)
        .where(eq(users.identificationCode, code))
        .limit(1);
      const user = userRows[0];

      if (!user) {
        return reply.send(
          provider.formatToolResult({
            id: toolCall.id,
            speech: "Código incorrecto. Por favor verifica tu código e inténtalo de nuevo.",
          }),
        );
      }

      const credRows = await db()
        .select()
        .from(credentials)
        .where(eq(credentials.userId, user.id))
        .limit(1);
      const cred = credRows[0];

      if (!cred) {
        return reply.send(
          provider.formatToolResult({
            id: toolCall.id,
            speech: "Tu cuenta no tiene credenciales del SAT configuradas. Por favor configúralas en la plataforma.",
          }),
        );
      }

      await setCaller(toolCall.callId, {
        userId: user.id,
        credentialId: cred.id,
        rfc: cred.rfc,
      });

      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: `Autenticado. Hola ${user.displayName ?? ""}. ¿En qué te puedo ayudar hoy?`,
        }),
      );
    }

    // ── Skills SAT (requieren autenticación previa) ──────────────────────────
    if (!SKILL_NAMES.includes(toolCall.skill as SkillName)) {
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: `No conozco la acción ${toolCall.skill}.`,
        }),
      );
    }

    const caller = await resolveCaller(toolCall.callId);
    if (!caller) {
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: "Primero dime tu código de identificación para autenticarte.",
        }),
      );
    }

    const correlationId = uuid();
    const job: ScrapeJob = {
      skill: toolCall.skill as SkillName,
      correlationId,
      idempotencyKey: idempotencyKey({ s: toolCall.skill, ...toolCall.args, c: correlationId }),
      userId: caller.userId,
      credentialId: caller.credentialId,
      rfc: caller.rfc,
      input: toolCall.args,
    };

    try {
      const result = await runSkillViaQueue(job);
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: speak(result),
          data: result,
        }),
      );
    } catch (err) {
      return reply.send(
        provider.formatToolResult({
          id: toolCall.id,
          speech: `No pude completar la acción: ${(err as Error).message}`,
        }),
      );
    }
  });
}

function speak(result: import("@sat/events").SkillResult): string {
  switch (result.skill) {
    case "getEmitedInvoices":
      return `Encontré ${result.invoices.length} facturas emitidas.`;
    case "getReceiptInvoices":
      return `Encontré ${result.invoices.length} facturas recibidas.`;
    case "generateCSF":
      return `Tu régimen es ${result.csf.regimenFiscal.map((r) => r.nombre).join(", ") || "—"}.`;
    case "generateInvoice":
      return result.status === "previewed"
        ? `Vista previa lista: total ${result.preview.total} pesos. ¿La emito?`
        : `Factura emitida con folio ${result.issued.uuid}.`;
    default:
      return "Listo.";
  }
}
