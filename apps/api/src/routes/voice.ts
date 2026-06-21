import type { FastifyInstance } from "fastify";
import { idempotencyKey, uuid } from "@sat/shared";
import { type ScrapeJob, type SkillName, SKILL_NAMES } from "@sat/events";
import { makeVoiceProvider } from "@sat/voice";
import { runSkillViaQueue } from "../queue.js";
import { resolveCaller } from "../caller.js";

/**
 * Provider-agnostic voice webhook. Vapi (default) or ElevenLabs post here; we
 * normalize, run the matching skill over the queue, and return the provider's
 * expected tool-result shape. Set VOICE_PROVIDER + provider creds in .env.
 */
export async function voiceRoutes(app: FastifyInstance) {
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
      return reply.send({ ok: true }); // transcripts/status: ack
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

    const caller = await resolveCaller(toolCall.callId);
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
