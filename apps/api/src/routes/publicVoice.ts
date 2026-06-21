import { PassThrough } from "node:stream";
import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { env } from "@sat/shared";
import { makeAnthropic, tools } from "@sat/agent";
import type { SkillName } from "@sat/events";
import { fixtureFor } from "../voiceFixtures.js";

// Voice agent prompt: it executes skills via tools, then NARRATES the result so
// the spoken explanation and the on-screen visualization come from one turn.
const VOICE_AGENT_PROMPT = `Eres SATI, un asistente fiscal de México, en una demo por voz.

Cuando el usuario pida ver sus facturas (emitidas o recibidas), su constancia / régimen / obligaciones, o generar una factura, LLAMA la herramienta correspondiente. Los datos de esta demo son de ejemplo.

Después de recibir el resultado de una herramienta, EXPLÍCALO hablado, en español mexicano, en 1 o 2 oraciones cortas, mencionando las cifras concretas (totales, IVA, próximo vencimiento). No leas listas ni markdown ni caracteres especiales — habla como un contador que resume de un vistazo.

Si el usuario solo conversa o pregunta algo general del SAT, responde breve como experto e invítalo a pedir sus facturas o su constancia.

generateInvoice: genera SOLO la vista previa (confirmed=false) y describe el total a emitir; NUNCA emitas de verdad en la demo.

TU RESPUESTA SE CONVIERTE A VOZ: máximo 2 oraciones, directas, sin enumeraciones.`;

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

      // 2 — Claude tool-calling loop. The agent may call a skill (→ `skill`
      // event drives the visualization) and then narrates the result (→ `text`,
      // which becomes the TTS below). Both come from the same turn.
      let assistantText = "";
      const messages: Anthropic.MessageParam[] = [
        ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
      ];

      for (let i = 0; i < 4; i++) {
        const res = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: VOICE_AGENT_PROMPT,
          tools,
          messages,
        });
        messages.push({ role: "assistant", content: res.content });

        if (res.stop_reason !== "tool_use") {
          const text = res.content.find((c) => c.type === "text");
          assistantText = text && "text" in text ? text.text : "";
          break;
        }

        // Run each requested skill against demo fixtures, emit the structured
        // result so the frontend renders the panel, and feed it back to Claude.
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          try {
            // Public demo: skills run against fixtures (no SAT credentials here).
            const result = fixtureFor(
              block.name as SkillName,
              block.input as Record<string, unknown>,
            );
            send({ type: "skill", result });
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
        messages.push({ role: "user", content: toolResults });
      }

      if (assistantText) send({ type: "text", chunk: assistantText });

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
      system: VOICE_AGENT_PROMPT,
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
