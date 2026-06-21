import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { env } from "@sat/shared";
import { connection } from "../queue.js";

/**
 * POST /public/call/request
 *
 * Solicita una llamada saliente de Vapi al número indicado.
 * Requiere VAPI_API_KEY, VAPI_PHONE_NUMBER_ID y VAPI_ASSISTANT_ID en el entorno.
 *
 * Rate limits:
 *  - 3 llamadas por IP cada 10 minutos (anti-abuso)
 *  - 1 llamada por número de teléfono cada 10 minutos (evita spam al mismo destino)
 */
export async function publicCallRoutes(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 3,
    timeWindow: "10 minutes",
    keyGenerator: (req) => {
      const fwd = req.headers["x-forwarded-for"];
      return (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0])?.trim() ?? req.ip ?? "unknown";
    },
    errorResponseBuilder: () => ({
      error: "Demasiadas solicitudes. Espera unos minutos antes de intentarlo de nuevo.",
    }),
  });

  app.post<{ Body: { phoneNumber: string } }>("/public/call/request", async (req, reply) => {
    const { VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID } = env;

    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID || !VAPI_ASSISTANT_ID) {
      return reply.code(503).send({ error: "Servicio de llamadas no configurado." });
    }

    const { phoneNumber } = req.body;
    if (!phoneNumber?.trim()) {
      return reply.code(400).send({ error: "phoneNumber requerido." });
    }

    const raw = phoneNumber.trim().replace(/\s+/g, "");
    const e164 = raw.startsWith("+") ? raw : `+${raw}`;

    const bypassNumbers = (env.VAPI_CALL_BYPASS_NUMBERS ?? "")
      .split(",")
      .map((n) => n.trim().replace(/\s+/g, ""))
      .filter(Boolean);
    const isBypassed = bypassNumbers.includes(e164);

    // Por número de destino: 1 llamada cada 10 min (se salta para números en whitelist)
    if (!isBypassed) {
      const phoneKey = `call:phone:${e164.replace(/\D/g, "")}`;
      const alreadyCalled = await connection.get(phoneKey).catch(() => null);
      if (alreadyCalled) {
        return reply.code(429).send({
          error: "Ya se envió una llamada a este número recientemente. Espera 10 minutos.",
        });
      }
    }

    const res = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        assistantId: VAPI_ASSISTANT_ID,
        customer: { number: e164 },
      }),
    });

    const rawBody = await res.text();
    req.log.info({ status: res.status, e164, body: rawBody }, "vapi call response");

    if (!res.ok) {
      req.log.error({ status: res.status, detail: rawBody }, "vapi outbound call error");
      return reply.code(502).send({ error: "No se pudo iniciar la llamada." });
    }

    if (!isBypassed) {
      await connection.set(`call:phone:${e164.replace(/\D/g, "")}`, "1", "EX", 600).catch(() => {});
    }

    const data = JSON.parse(rawBody) as { id?: string; status?: string };
    return reply.send({ ok: true, callId: data.id });
  });
}
