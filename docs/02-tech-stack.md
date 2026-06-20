# 2 · Tech Stack

Chosen *ad hoc* to our actual needs: live scraping of JS-heavy, captcha-gated SAT
portals; an event-driven, resilient backend; high-performance queries and
vectorization; a voice front; and a régimen-aware generated UI.

## 2.1 The one constraint that decides the language

The SAT portals are **JavaScript-rendered, session-stateful, and gated by
alphanumeric image captchas**. That mandates a real browser automation engine →
**Playwright**. Playwright is best-supported on **Node.js/TypeScript**, and the
AI + voice SDKs we want are all first-class in TS. So the entire stack is
**TypeScript**, end to end, in one monorepo. This also lets us share types
(event contracts, tool schemas, DB models) between scraper, backend, and frontend.

## 2.2 Stack at a glance

| Concern | Choice | Why |
|---|---|---|
| Language / runtime | **TypeScript on Node.js 22** | Playwright + AI/voice SDKs + shared types |
| Monorepo | **pnpm workspaces + Turborepo** | Fast, cached builds; clean package boundaries |
| Scraper (Brisk Camel) | **Firecrawl `/interact`** (primary) behind a `BrowserDriver` abstraction; **Playwright** (fallback/prod) | `/interact` is managed Playwright: stateful sessions, anti-bot infra, live-view human takeover, unlimited credits. Same flow code runs on either. See [08-scraper-decision.md](./08-scraper-decision.md) |
| Captcha solving | **Claude vision (`claude-opus-4-8`)** + Firecrawl live-view fallback | Claude reads the alphanumeric image and types it; on repeated failure, hand the interactive live view to the user |
| API | **Fastify** | Fast, schema-first (JSON Schema / TypeBox), great DX |
| Event bus / queues | **BullMQ on Redis** | Durable jobs, retries, backoff, dead-letter, rate-limiting, scheduling |
| Database | **PostgreSQL + `pgvector`** | One store for relational data *and* embeddings |
| ORM / migrations | **Drizzle ORM** | Type-safe, lightweight, SQL-first, easy migrations |
| AI agent | **Claude `claude-opus-4-8`** via `@anthropic-ai/sdk` | Tool use, adaptive thinking, vision for captchas |
| Embeddings (RAG) | **Voyage AI** (`voyage-3`) | Anthropic's recommended embedding pairing |
| Voice (in) | **Whisper** (STT) | Robust Spanish transcription |
| Voice (in/out) | **ElevenLabs Conversational AI** | Low-latency voice agent, TTS, telephony |
| Frontend | **Next.js (App Router) + React + Tailwind + shadcn/ui** | Fast to build; dynamic, régimen-aware UI |
| Realtime to UI | **SSE** (agent action stream) | Simple, one-way streaming of agent progress |
| Validation | **Zod** | Tool inputs, event payloads, API boundaries |
| Secrets at rest | **libsodium / AES-GCM** + KMS-style key | Encrypt SAT credentials; see [07-security.md](./07-security.md) |
| Observability | **Pino** logs + **OpenTelemetry** traces | Trace an utterance → event → scrape → result |
| Deploy | Personal repo → **Render/Fly** (backend + workers + Redis + Postgres), **Vercel** (frontend) | Per README mirror-to-personal-repo note |

## 2.3 Monorepo layout

```
.
├── apps/
│   ├── api/            # Fastify HTTP + SSE, publishes events, agent loop, voice webhook   [:3000]
│   ├── worker/         # BullMQ workers: runs Brisk Camel flows, normalizes, embeds
│   └── frontend/       # Frontend (Next.js): login, .cer/.key upload, dynamic UI, voice  [:3001]
├── packages/
│   ├── scraper/        # "Brisk Camel": BrowserDriver (Firecrawl/Playwright) + captcha + flows
│   ├── agent/          # Claude tool definitions (the skills) + 529/overload resilience
│   ├── voice/          # Provider-agnostic voice layer (Vapi + ElevenLabs adapters)
│   ├── events/         # Event names, Zod schemas, credential/skill/result contracts
│   ├── db/             # Drizzle schema, migrations, query helpers (incl. pgvector)
│   ├── rag/            # Voyage embeddings + retrieval text builders
│   └── shared/         # Config, logging, crypto, errors, ids
├── infra/              # redis.conf + dev Dockerfiles (api/worker/frontend)
└── docs/
```

> The **`frontend`** app (docker-compose `frontend` service, port 3001) is owned
> outside the backend scaffold and not built here yet.

Why this split: the **scraper** and **agent** are pure libraries with no I/O
opinions, so they're testable in isolation and reusable by both `api` and
`worker`. Event contracts live in one place so producer and consumer can't drift.

## 2.4 Why these and not the obvious alternatives

- **TS over Python:** Python has Playwright too, but our AI + voice + frontend are
  all TS, and a single-language monorepo with shared types is a big velocity win at
  hackathon pace. (The Anthropic SDK is equally good in both.)
- **BullMQ over Kafka/NATS:** we need durable jobs with retries/backoff/DLQ and
  scheduling, not a high-throughput log. BullMQ on the Redis we already run is the
  right size. (Postgres-based `pg-boss` is a fine fallback if we want zero Redis.)
- **pgvector over a dedicated vector DB:** one database to operate; transactional
  consistency between a document and its embedding; plenty fast at our scale.
- **Claude vision for captchas over 2captcha/anti-captcha:** no extra vendor, no
  per-solve cost, no PII leaving to a captcha farm, and we already have the SDK.
- **Voyage embeddings:** Anthropic's recommended pairing for retrieval quality
  alongside Claude.
- **Fastify over Express/Nest:** schema-first, fast, minimal — and SSE is trivial.

## 2.5 Performance notes

- **Queries:** `pgvector` HNSW index for ANN search; relational reads indexed on
  `(rfc, type, issued_at)`. Heavy scraper artifacts (HTML/PDF) stored in object
  storage / large columns, *not* in the hot query path.
- **Caching:** Claude **prompt caching** on the stable agent system prompt + tool
  definitions to cut latency/cost across turns (see the Anthropic prompt-caching guidance).
- **Latency UX:** every scrape is async; the UI shows live agent progress over SSE
  so perceived latency stays low even when SAT is slow.
