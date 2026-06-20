import { PassThrough } from "node:stream";
import type { FastifyInstance } from "fastify";
import { env } from "@sat/shared";
import { makeAnthropic } from "@sat/agent";

const SAT_EXPERT_PROMPT = `Eres SATI, un asistente fiscal virtual experto en el SAT de México. Estás en la demo pública de SATI.

En esta demo NO tienes acceso a datos fiscales reales del usuario. Si preguntan por sus facturas, declaraciones o datos concretos del SAT, invítalos amablemente a crear una cuenta gratuita en SATI para conectarse con el SAT real.

Puedes responder con conocimiento general sobre:
- Regímenes fiscales: RESICO, Actividad Empresarial, Personas Morales, asalariados, arrendamiento
- CFDI y facturas: tipos (ingreso, gasto, traslado, nómina), cancelaciones, complementos
- Impuestos: IVA 16%, ISR, retenciones, PTU, pagos provisionales
- Fechas clave: declaraciones mensuales (día 17), declaración anual (abril PF, marzo PM), DIOT
- Trámites SAT: RFC, e.firma, buzón tributario, CSF, cambios de régimen
- Multas, EFOS, listas negras, auditorías y actos de fiscalización

Responde en español mexicano, tono amigable y profesional. TU RESPUESTA SE CONVIERTE A VOZ: máximo 2 oraciones cortas y directas, sin listas ni markdown ni caracteres especiales.`;

type Message = { role: "user" | "assistant"; content: string };

export async function publicVoiceRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  // POST /public/voice/stream — streaming SSE endpoint (primary, for HeroOrb)
  app.post<{
    Body: { audioBase64: string; mimeType: string; history?: Message[] };
  }>("/public/voice/stream", async (req, reply) => {
    if (!anthropic) {
      return reply.code(503).send({ error: "Servicio de IA no disponible" });
    }
    if (!env.ELEVENLABS_API_KEY) {
      return reply.code(503).send({ error: "Servicio de voz no configurado" });
    }

    const { audioBase64, mimeType = "audio/webm", history = [] } = req.body;
    if (!audioBase64) {
      return reply.code(400).send({ error: "audioBase64 requerido" });
    }

    const pt = new PassThrough();
    const send = (ev: object) => {
      try {
        if (!pt.destroyed) pt.write(`data: ${JSON.stringify(ev)}\n\n`);
      } catch { /* client disconnected */ }
    };

    reply
      .header("Content-Type", "text/event-stream; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .header("Connection", "keep-alive")
      .header("X-Accel-Buffering", "no")
      .send(pt);

    try {
      // 1 — STT
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: mimeType }), "audio.webm");
      formData.append("model_id", "scribe_v1");
      formData.append("language_code", "es");

      const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        body: formData,
      });

      if (!sttRes.ok) {
        send({ type: "error", message: "Error al transcribir el audio" });
        pt.end();
        return;
      }

      const { text: userText } = (await sttRes.json()) as { text: string };
      if (!userText?.trim()) {
        send({ type: "error", message: "No se detectó voz en el audio" });
        pt.end();
        return;
      }

      // Send transcript immediately — frontend shows user text right away
      send({ type: "transcript", userText });

      // 2 — Claude streaming (send text as it arrives)
      let assistantText = "";
      const messages: Message[] = [
        ...history.slice(-6),
        { role: "user", content: userText },
      ];

      const claudeStream = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 120,
        system: SAT_EXPERT_PROMPT,
        messages,
        stream: true,
      });

      for await (const event of claudeStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          assistantText += event.delta.text;
          send({ type: "text", chunk: event.delta.text });
        }
      }

      // 3 — TTS with turbo model + streaming (send audio chunks as they arrive)
      const voiceId = env.ELEVENLABS_VOICE_ID.replace(/^['"]|['"]$/g, "");
      const ttsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: assistantText,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.1 },
          }),
        },
      );

      if (ttsRes.ok && ttsRes.body) {
        const reader = ttsRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          send({ type: "audio", chunk: Buffer.from(value).toString("base64") });
        }
      }

      send({ type: "done", assistantText });
    } catch (err) {
      req.log.error(err, "voice/stream error");
      send({ type: "error", message: "Error en el servidor" });
    } finally {
      try { pt.end(); } catch { /* already ended */ }
    }
  });

  // POST /public/voice/chat — kept as fallback (non-streaming)
  app.post<{
    Body: { audioBase64: string; mimeType: string; history?: Message[] };
  }>("/public/voice/chat", async (req, reply) => {
    if (!anthropic) {
      return reply.code(503).send({ error: "Servicio de IA no disponible" });
    }
    if (!env.ELEVENLABS_API_KEY) {
      return reply.code(503).send({ error: "Servicio de voz no configurado" });
    }

    const { audioBase64, mimeType = "audio/webm", history = [] } = req.body;
    if (!audioBase64) {
      return reply.code(400).send({ error: "audioBase64 requerido" });
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: mimeType }), "audio.webm");
    formData.append("model_id", "scribe_v1");
    formData.append("language_code", "es");

    const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      body: formData,
    });

    if (!sttRes.ok) {
      const err = await sttRes.text();
      req.log.error({ status: sttRes.status, err }, "ElevenLabs STT error");
      return reply.code(502).send({ error: "Error al transcribir el audio" });
    }

    const { text: userText } = (await sttRes.json()) as { text: string };
    if (!userText?.trim()) {
      return reply.code(422).send({ error: "No se detectó voz en el audio" });
    }

    const messages: Message[] = [
      ...history.slice(-6),
      { role: "user", content: userText },
    ];

    const claudeRes = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 120,
      system: SAT_EXPERT_PROMPT,
      messages,
    });

    const block = claudeRes.content.find((c) => c.type === "text");
    const assistantText = block && "text" in block ? block.text : "No pude procesar tu pregunta.";

    const voiceId = env.ELEVENLABS_VOICE_ID.replace(/^['"]|['"]$/g, "");
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: assistantText,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.8 },
        }),
      },
    );

    if (!ttsRes.ok) {
      req.log.error({ status: ttsRes.status }, "ElevenLabs TTS error");
      return reply.send({ userText, assistantText, audioBase64: null });
    }

    const audioBuf = Buffer.from(await ttsRes.arrayBuffer());
    return reply.send({
      userText,
      assistantText,
      audioBase64: audioBuf.toString("base64"),
    });
  });
}
