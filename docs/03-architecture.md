# 3 · Architecture

Event-driven by design: every assistant action is an event, every scraper
response is persisted and replayable, and the slow/flaky parts (scraping) are
decoupled from the fast/interactive parts (voice + UI).

## 3.1 Components

```
┌────────────────────────── Client (apps/web) ──────────────────────────┐
│  Login · Upload .cer/.key · Voice (ElevenLabs/Whisper) · Dynamic UI    │
│  RAG client panel · Custom report/UI per régimen · SSE agent stream    │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTPS + SSE
┌───────────────▼──────────────── Backend (apps/api) ───────────────────┐
│  Fastify REST + SSE                                                     │
│  Agent caller (Claude Opus 4.8, adaptive thinking, tool use)           │
│  Response normalization (incl. voice-chat interactions)                │
│         │ emit <E>()                          ▲ result events           │
└─────────┼────────────────────────────────────┼────────────────────────┘
          │                                      │
   ┌──────▼───────── Event bus (BullMQ / Redis) ─┴──────┐
   │  queues: scrape.*  ·  embed  ·  notify             │
   │  retries · backoff · dead-letter · rate-limit/RFC  │
   └──────┬─────────────────────────────────────────────┘
          │ jobs
┌─────────▼──────────── Workers (apps/worker) ──────────────────────────┐
│  Brisk Camel (packages/scraper): flows via BrowserDriver               │
│     (Firecrawl /interact primary · Playwright fallback) + captcha solve│
│  Normalizer → persist → emit *.succeeded / *.failed                    │
│  Embedder (packages/rag): chunk → Voyage → pgvector                    │
└─────────┬──────────────────────────────────────────────┬─────────────┘
          │                                                │
   ┌──────▼──────── SAT portals ────────┐         ┌───────▼──── DB (Postgres) ───────┐
   │  cfdiau / portalcfdi / portal SAT  │         │ credentials (uuid, user, enc)    │
   │  (real data source)                │         │ documents (uuid, doc, vector, md)│
   └────────────────────────────────────┘         │ events · jobs · users · reports  │
                                                   └──────────────────────────────────┘
```

## 3.2 The core loop

1. **Utterance.** User speaks; ElevenLabs/Whisper yields text to the API.
2. **Agent turn.** The Claude agent decides which **skill (tool)** to call
   (see [04-skills.md](./04-skills.md)). For `generateInvoice` it first surfaces a
   *vista previa* and waits for confirmation.
3. **`emit <E>()`.** The tool publishes a `scrape.<op>.requested` event with a body
   (`rfc`, params) and correlation id. The API returns immediately; the agent
   awaits the matching result event.
4. **Brisk Camel runs.** A worker picks up the job, hydrates the credentialed
   browser session, solves the captcha (Claude vision), executes the flow, and
   captures raw artifacts.
5. **Normalize + persist + emit.** The worker normalizes the result, stores the
   document(s) + raw artifacts, and emits `scrape.<op>.succeeded` (or `.failed`).
6. **Embed (async).** An `embed` job chunks the new document, embeds it (Voyage),
   and upserts into `pgvector`.
7. **Respond.** The agent receives the result, the API streams progress/answer to
   the UI over SSE, and the voice layer speaks the reply. The **dynamic UI**
   renders the données (table, CSF, report) per the user's régimen.
8. **RAG, anytime.** The RAG client queries `pgvector` + relational data to answer
   "what's my situation / what's due / what should I review", citing stored docs.

## 3.3 Why event-driven

- **Decoupling:** voice/UI stay responsive while scraping (seconds–minutes) runs out of band.
- **Resilience:** retries, backoff, and a dead-letter queue are built into the bus;
  a failed scrape is a `*.failed` event, not a crashed request.
- **Replayability & audit:** the `events` table is an append-only log — every action
  and every scraper response is reconstructable. Re-run a normalizer or re-embed
  without re-scraping by replaying stored raw artifacts.
- **Backpressure:** per-RFC rate limits prevent SAT lockouts; queues absorb spikes.

## 3.4 Resilience patterns (concrete)

| Pattern | Implementation |
|---|---|
| Retries w/ backoff | BullMQ `attempts` + exponential backoff per job type |
| Captcha recovery | On solve failure, reload captcha and retry up to N; then `*.failed` with reason |
| Idempotency | Each request carries an `idempotencyKey`; duplicate events no-op |
| Dead-letter | Exhausted jobs land in a DLQ queue for inspection/replay |
| Circuit breaking | If SAT error-rate spikes, pause the `scrape.*` queues, surface a status |
| Timeouts | Per-step Playwright timeouts; whole-flow deadline → `*.failed` |
| Raw artifact capture | Always store the HTML/PDF/screenshot, even on failure, for debugging + replay |
| Correlation | Every event/job/log carries `correlationId` + `rfc`; OTel spans tie them together |

## 3.5 State & sessions

- **Credential store:** `(uuid, username/RFC, encrypted password, optional .cer/.key)`.
  Decrypted only inside the worker, in-memory, for the duration of a flow. we'll likely encrypt/decrypt communication by AES.
- **Browser sessions:** a warm authenticated context is cached per RFC (short TTL)
  so consecutive flows skip re-login; invalidated on auth errors.
- **Agent state:** conversation history per session; long conversations use Claude
  **compaction**; the system prompt + tool list are kept byte-stable for prompt-cache hits.
  ***Extension to platforms**: We need to be able to have a WA chat that works, in order to do so, we need to trigger mails with verification codes that are passed to the WA chat to verify the user on a limited-session (e.g. 5 minutes)

## 3.6 What lives where (mapping to the diagram)

- **SAT CLIENT / Brisk Camel** → `packages/scraper` run inside `apps/worker`.
- **EVENT LIST** (`getEmitedInvoices`, `getReceiptInvoices`, `generateCSF`,
  `generateInvoice`) → the four skills in [04-skills.md](./04-skills.md), each a
  queue + event pair.
- **emit `<E>()` / Agent caller / Claude model / Response normalization** → `apps/api` + `packages/agent`.
- **DB: pgvector + credentials** → `packages/db` (`documents`, `credentials`).
- **Client: Login / Append .cer/.key / Render custom report-UI / RAG client** → `apps/web`.
