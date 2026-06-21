import "../types.js";
import { PassThrough } from "node:stream";
import type { FastifyInstance } from "fastify";
import type Anthropic from "@anthropic-ai/sdk";
import { env, idempotencyKey, uuid } from "@sat/shared";
import {
  tools,
  SYSTEM_PROMPT,
  PRIMARY_MODEL,
  makeAnthropic,
  createMessageResilient,
} from "@sat/agent";
import { type ScrapeJob, type SkillName, type SkillResult } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";
import { extractTicket } from "@sat/scraper";

const TOOL_LABELS: Record<string, string> = {
  getEmitedInvoices: "Consultando facturas emitidas…",
  getReceiptInvoices: "Consultando facturas recibidas…",
  generateCSF: "Descargando Constancia de Situación Fiscal…",
  generateInvoice: "Preparando factura…",
  extractTicketData: "Extrayendo datos del ticket…",
};

export async function agentVoiceRoutes(app: FastifyInstance) {
  const anthropic = env.ANTHROPIC_API_KEY ? makeAnthropic(env.ANTHROPIC_API_KEY) : null;

  /**
   * POST /agent/voice-turn  (authenticated, SSE)
   *
   * Accepts either voice (audioBase64) or text. Runs the full agent agentic loop
   * with tool use, streams progress events, then optionally TTS the reply.
   *
   * SSE event types:
   *   transcript    — STT result (voice only)
   *   thinking      — Claude is thinking
   *   tool_call     — a skill is being executed
   *   tool_result   — skill completed, includes parsed result
   *   text          — final text response
   *   audio         — base64 MP3 chunk (TTS)
   *   done          — all done; includes full messages + optional skillResult
   *   error         — something went wrong
   */
  app.post<{
    Body: {
      audioBase64?: string;
      mimeType?: string;
      text?: string;
      messages?: Anthropic.MessageParam[];
    };
  }>("/agent/voice-turn", { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!anthropic) return reply.code(500).send({ error: "ANTHROPIC_API_KEY not set" });

    const { userId, credentialId, rfc } = req.user;
    const { audioBase64, mimeType = "audio/webm", text, messages: incomingMessages = [] } = req.body;

    if (!audioBase64 && !text) {
      return reply.code(400).send({ error: "audioBase64 o text requerido" });
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
      let userText = text ?? "";

      // 1 — STT (only if voice input)
      if (audioBase64 && env.ELEVENLABS_API_KEY) {
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

        const { text: transcribed } = (await sttRes.json()) as { text: string };
        if (!transcribed?.trim()) {
          send({ type: "error", message: "No se detectó voz en el audio" });
          pt.end();
          return;
        }
        userText = transcribed;
        send({ type: "transcript", userText });
      }

      // 2 — Agent agentic loop

      // If the last incoming message already contains the user text (e.g. with an image),
      // don't add a duplicate text-only message.
      const lastIncoming = incomingMessages[incomingMessages.length - 1];
      const lastContent = lastIncoming?.content;
      const lastHasUserText =
        Array.isArray(lastContent) &&
        lastContent.some((b) => b.type === "text" && "text" in b && b.text === userText);
      const lastHasImage =
        Array.isArray(lastContent) && lastContent.some((b) => b.type === "image");

      const messages: Anthropic.MessageParam[] = [...incomingMessages];
      if (userText && !(lastHasUserText && lastHasImage)) {
        messages.push({ role: "user", content: userText });
      }

      // Log message summary for debugging
      const imageMessages = messages.filter((m) => {
        const c = m.content;
        return Array.isArray(c) && c.some((b) => b.type === "image");
      });
      const imageCount = imageMessages.length;
      req.log.info(
        { totalMessages: messages.length, imageMessages: imageCount, userTextLength: userText.length },
        "agent turn started",
      );

      // Detailed logging for first image (debug why extraction might fail)
      if (imageCount > 0) {
        const firstImageMsg = imageMessages[0];
        const imageBlocks = Array.isArray(firstImageMsg.content)
          ? firstImageMsg.content.filter((b) => b.type === "image")
          : [];
        const sizeKb = imageBlocks.reduce((sum, b) => {
          if ("source" in b && "data" in b.source) {
            return sum + (b.source.data as string).length / 1024;
          }
          return sum;
        }, 0);
        req.log.debug(
          { imageCount: imageBlocks.length, sizeKb: Math.round(sizeKb) },
          "image blocks detected",
        );
      }

      let lastSkillResult: SkillResult | null = null;
      let finalReply = "";

      for (let i = 0; i < 6; i++) {
        const res = await createMessageResilient(
          anthropic,
          {
            model: PRIMARY_MODEL,
            max_tokens: 4096,
            thinking: { type: "adaptive" },
            system: SYSTEM_PROMPT,
            tools,
            messages,
          },
          req.log,
        );

        // Extract and send thinking content
        const thinkingBlock = res.content.find((b) => b.type === "thinking");
        if (thinkingBlock && "thinking" in thinkingBlock) {
          const thinkingText = (thinkingBlock.thinking as string).slice(0, 500); // First 500 chars
          send({ type: "thinking", content: thinkingText });
        }

        messages.push({ role: "assistant", content: res.content });

        if (res.stop_reason !== "tool_use") {
          const textBlock = res.content.find((c) => c.type === "text");
          finalReply = textBlock && "text" in textBlock ? textBlock.text : "";
          break;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;

          send({ type: "tool_call", name: block.name, label: TOOL_LABELS[block.name] ?? block.name });

          const correlationId = uuid();

          try {
            let result: SkillResult;

            if (block.name === "extractTicketData") {
              // Lightweight tool: execute inline, no BullMQ
              const input = block.input as { imageBase64: string; imageMediaType: string };
              const extraction = await extractTicket(input.imageBase64, input.imageMediaType, correlationId);
              result = { skill: "extractTicket", extraction };
            } else {
              // Heavy tool: dispatch via BullMQ queue
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
            send({ type: "tool_result", skill: block.name, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            send({ type: "tool_result", skill: block.name, error: (err as Error).message });
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

      send({ type: "text", text: finalReply });

      // 3 — TTS (only if ElevenLabs available and we have a reply)
      if (finalReply && env.ELEVENLABS_API_KEY) {
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
              text: finalReply,
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
      }

      send({ type: "done", assistantText: finalReply, messages, skillResult: lastSkillResult });
    } catch (err) {
      req.log.error(err, "agent/voice-turn error");
      send({ type: "error", message: "Error en el servidor" });
    } finally {
      try { pt.end(); } catch { /* already ended */ }
    }
  });
}
