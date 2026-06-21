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
import { resolveFastPath, csfFromDb, invoicesFromDb } from "../fastPath.js";
import {
  persistToolResult,
  runSearchHistory,
  runTopCounterparties,
  runFiscalProfile,
  logUserQuery,
} from "../ragMemory.js";

// ── TTS preprocessing ──────────────────────────────────────────────────────
// ElevenLabs reads "$42,000" as "cuarenta y dos coma cero cero cero" in Spanish.
// We convert currency figures to spelled-out Spanish before sending to TTS.
function numToSpanish(n: number): string {
  const units = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const tens = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const hundreds = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
    'seiscientos','setecientos','ochocientos','novecientos'];

  if (n === 0) return 'cero';
  if (n < 0) return `menos ${numToSpanish(-n)}`;

  let result = '';
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    result += (m === 1 ? 'un millón' : `${numToSpanish(m)} millones`) + ' ';
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    const k = Math.floor(n / 1_000);
    result += (k === 1 ? 'mil' : `${numToSpanish(k)} mil`) + ' ';
    n %= 1_000;
  }
  if (n >= 100) {
    if (n === 100) { result += 'cien '; n = 0; }
    else { result += hundreds[Math.floor(n / 100)]! + ' '; n %= 100; }
  }
  if (n >= 20) {
    result += tens[Math.floor(n / 10)]!;
    if (n % 10 !== 0) result += ` y ${units[n % 10]!}`;
    result += ' ';
  } else if (n > 0) {
    result += units[n]! + ' ';
  }
  return result.trim();
}

function preprocessForTTS(text: string): string {
  // $1,234,567 → "un millón doscientos treinta y cuatro mil quinientos sesenta y siete pesos"
  // $1,234 → "mil doscientos treinta y cuatro pesos"
  // $123.45 → "ciento veintitrés pesos con cuarenta y cinco centavos"
  return text.replace(/\$\s*([\d,]+)(?:\.(\d{1,2}))?(?:\s*(MXN|mxn|pesos?\s*mexicanos?|pesos?))?/g, (_, intPart, cents, unit) => {
    const n = parseInt(intPart.replace(/,/g, ''), 10);
    const isMxn = unit && /mxn|mexican/i.test(unit);
    const currency = isMxn
      ? (n === 1 ? 'peso mexicano' : 'pesos mexicanos')
      : (n === 1 ? 'peso' : 'pesos');
    let spoken = numToSpanish(n) + ' ' + currency;
    if (cents) {
      const c = parseInt(cents.padEnd(2, '0'), 10);
      if (c > 0) spoken += ` con ${numToSpanish(c)} centavos`;
    }
    return spoken;
  });
}

const TOOL_LABELS: Record<string, string> = {
  getEmitedInvoices: "Consultando facturas emitidas…",
  getReceiptInvoices: "Consultando facturas recibidas…",
  generateCSF: "Descargando Constancia de Situación Fiscal…",
  generateInvoice: "Preparando factura…",
  extractTicketData: "Extrayendo datos del ticket…",
  renderWidget: "Generando visualización…",
  displayRecommendations: "Generando recomendaciones…",
  displayKpis: "Calculando métricas clave…",
  displayFiscalSummary: "Preparando resumen fiscal…",
  searchHistory: "Buscando en tu historial…",
  getTopCounterparties: "Analizando contrapartes…",
  getFiscalProfile: "Consultando perfil fiscal…",
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

    // Heartbeat: a long skill (generateInvoice) can run minutes with no SSE traffic.
    // An idle stream gets dropped by browsers/proxies, so write an SSE comment line
    // (": ping" — ignored by the client parser) every 15s to keep the connection warm.
    const heartbeat = setInterval(() => {
      try {
        if (!pt.destroyed) pt.write(`: ping\n\n`);
      } catch { /* client disconnected */ }
    }, 15_000);

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

      // Log the user's NL query for the top-queries suggestions.
      logUserQuery({ userId: userId ?? "", rfc: rfc ?? "" }, userText, req.log);

      // Detailed logging for first image (debug why extraction might fail)
      const firstImageMsg = imageMessages[0];
      if (firstImageMsg) {
        const imageBlocks = Array.isArray(firstImageMsg.content)
          ? firstImageMsg.content.filter((b) => b.type === "image")
          : [];
        const sizeKb = imageBlocks.reduce((sum, b) => {
          if ("source" in b && typeof b.source !== "string" && "data" in b.source) {
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

      // Fast path: answer common questions straight from the DB (RAG memory) and
      // skip the agent loop entirely. Skipped when an image is attached (ticket→
      // factura needs the agent); falls through (null) for nuanced asks.
      const fast =
        imageCount === 0
          ? await resolveFastPath({ userId: userId ?? "", rfc: rfc ?? "" }, userText, req.log)
          : null;
      if (fast) {
        finalReply = fast.reply;
        lastSkillResult = fast.skillResult;
        if (fast.skillResult) {
          send({ type: "tool_result", skill: fast.skillResult.skill, result: fast.skillResult });
        }
      }

      for (let i = 0; !fast && i < 6; i++) {
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

          // ── Generative UI tools: inline, no SAT/queue — route directly to frontend ──
          if (block.name === "renderWidget") {
            const { kind = "bar", title, subtitle, data = [], series, color } = block.input as Record<string, unknown>;
            const widgetResult = { skill: "renderWidget" as const, widget: { kind, title, subtitle, data, series, color } as import("@sat/events").WidgetSpec };
            lastSkillResult = widgetResult;
            send({ type: "tool_result", skill: "renderWidget", result: widgetResult });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ ok: true, rendered: true }) });
            continue;
          }

          if (block.name === "displayRecommendations") {
            const { title, recommendations = [] } = block.input as Record<string, unknown>;
            const result: import("@sat/events").SkillResult = { skill: "displayRecommendations", title: title as string | undefined, recommendations: recommendations as import("@sat/events").RecommendationItem[] };
            lastSkillResult = result;
            send({ type: "tool_result", skill: "displayRecommendations", result });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ ok: true }) });
            continue;
          }

          if (block.name === "displayKpis") {
            const { title, kpis = [] } = block.input as Record<string, unknown>;
            const result: import("@sat/events").SkillResult = { skill: "displayKpis", title: title as string | undefined, kpis: kpis as import("@sat/events").KpiItem[] };
            lastSkillResult = result;
            send({ type: "tool_result", skill: "displayKpis", result });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ ok: true }) });
            continue;
          }

          if (block.name === "displayFiscalSummary") {
            const { summary } = block.input as Record<string, unknown>;
            const result: import("@sat/events").SkillResult = { skill: "displayFiscalSummary", summary: summary as import("@sat/events").FiscalSummarySpec };
            lastSkillResult = result;
            send({ type: "tool_result", skill: "displayFiscalSummary", result });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ ok: true }) });
            continue;
          }

          // RAG / KG-lite reads: answered inline from this user's data — no SAT, no queue.
          if (
            block.name === "searchHistory" ||
            block.name === "getTopCounterparties" ||
            block.name === "getFiscalProfile"
          ) {
            const scope = { userId: userId ?? "", rfc: rfc ?? "" };
            const input = block.input as Record<string, unknown>;
            try {
              const out =
                block.name === "searchHistory"
                  ? await runSearchHistory(scope, input, req.log)
                  : block.name === "getTopCounterparties"
                    ? await runTopCounterparties(scope, input, req.log)
                    : await runFiscalProfile(scope, req.log);
              send({ type: "tool_result", skill: block.name, result: out });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(out),
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
            continue;
          }

          try {
            let result: SkillResult;

            if (block.name === "extractTicketData") {
              // Lightweight tool: execute inline, no BullMQ
              const input = block.input as { imageBase64: string; imageMediaType: string };
              const extraction = await extractTicket(input.imageBase64, input.imageMediaType, correlationId);
              result = { skill: "extractTicket", extraction };
            } else if (block.name === "getEmitedInvoices" || block.name === "getReceiptInvoices") {
              // DB-first: return cached invoices immediately, skip the SAT scraper.
              const inp = block.input as { from?: string; to?: string };
              const kind = block.name === "getEmitedInvoices" ? "emitted" : "received";
              const range = inp.from && inp.to ? { from: inp.from, to: inp.to } : null;
              const invoices = await invoicesFromDb(userId ?? "", rfc ?? "", kind, range);
              if (invoices.length > 0) {
                req.log.info({ tool: block.name, count: invoices.length, range }, "invoice DB cache hit — skipping queue");
                result = { skill: block.name, invoices };
              } else {
                // No cached data → fall through to SAT scraper
                const job: ScrapeJob = {
                  skill: block.name as SkillName,
                  correlationId,
                  idempotencyKey: idempotencyKey({ s: block.name, ...(block.input as object), c: correlationId }),
                  userId: userId ?? "",
                  credentialId: credentialId ?? "",
                  rfc: rfc ?? "",
                  input: block.input as Record<string, unknown>,
                };
                result = await runSkillViaQueue(job, 120_000);
              }
            } else if (block.name === "generateCSF") {
              // Check DB cache before dispatching to the queue — avoids BullMQ round-trip
              // (~1-2s overhead) when a fresh CSF is already stored.
              const cached = await csfFromDb(userId ?? "", rfc ?? "");
              if (cached) {
                req.log.info({ reqId: req.id }, "generateCSF DB cache hit — skipping queue");
                result = { skill: "generateCSF", csf: cached };
              } else {
                const job: ScrapeJob = {
                  skill: "generateCSF",
                  correlationId,
                  idempotencyKey: idempotencyKey({ s: block.name, ...(block.input as object), c: correlationId }),
                  userId: userId ?? "",
                  credentialId: credentialId ?? "",
                  rfc: rfc ?? "",
                  input: block.input as Record<string, unknown>,
                };
                result = await runSkillViaQueue(job, 120_000);
              }
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
              // generateInvoice is the long pole (login + captcha + multi-step form +
              // PDF + analysis) and routinely exceeds the 120s default — give it 5 min
              // so the API doesn't abandon a job the worker is still completing.
              const ttlMs = block.name === "generateInvoice" ? 300_000 : 120_000;
              result = await runSkillViaQueue(job, ttlMs);
            }

            lastSkillResult = result;
            // Write path: persist the result into RAG memory (fire-and-forget).
            persistToolResult({ userId: userId ?? "", rfc: rfc ?? "" }, result, req.log);
            // Frontend gets the full result (incl. the preview PDF for download).
            send({ type: "tool_result", skill: block.name, result });
            // The model does NOT need the raw PDF bytes — strip the base64 before feeding
            // the tool_result back into the conversation, or it bloats every turn's tokens.
            const modelResult =
              result.skill === "generateInvoice" && result.status === "previewed"
                ? { ...result, preview: { ...result.preview, pdfBase64: undefined } }
                : result;
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(modelResult),
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
              text: preprocessForTTS(finalReply),
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
      clearInterval(heartbeat);
      try { pt.end(); } catch { /* already ended */ }
    }
  });
}
