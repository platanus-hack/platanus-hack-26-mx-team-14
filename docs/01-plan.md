# 1 · The Plan

## 1.1 Problem & thesis

Interacting with the SAT is painful: captchas, brittle portals, opaque flows, and
a different set of obligations per *régimen fiscal*. Today you either do it by
hand or pay an accountant.

**Thesis:** the right interface is *conversational + grounded*. You say what you
want; an AI agent executes it against your real SAT account through a resilient
scraper, stores everything, and learns your situation well enough to remind and
advise you. The visual UI is generated to match your régimen — it surfaces only
the obligations and actions that apply to you.

This is a **New Interfaces** project: voice + agent + a régimen-aware generated UI
sitting on top of a live, real data source.

## 1.2 What we are building (scope)

The assistant can perform four core SAT operations (the "skills"), each backed by
a scraper flow against the real SAT portals:

1. **`getEmitedInvoices`** — pull *facturas emitidas* (issued CFDIs) for a date range.
2. **`getReceiptInvoices`** — pull *facturas recibidas* (received CFDIs).
3. **`generateCSF`** — fetch the *Constancia de Situación Fiscal* (PDF + extracted fields).
4. **`generateInvoice`** — issue a CFDI (with a mandatory human/voice confirmation gate before final emission).

Plus the cross-cutting capabilities:

- **Voice in/out** (ElevenLabs Conversational AI + Whisper STT).
- **Persistence + vectorization** of every scraper response.
- **RAG client** for régimen-aware reminders and recommendations.
- **Dynamic, régimen-aware UI** that renders custom reports and actions.

## 1.3 Non-goals (for the hackathon)

- Not a full accounting suite (no payroll, no DIOT, no annual declaration *yet*).
- No multi-tenant billing/SaaS hardening — single workspace, demo-grade auth.
- We **do not auto-emit invoices** without explicit confirmation — see the safety gate.

## 1.4 Phased plan

### Phase 0 — Foundations
- Monorepo scaffold (pnpm + Turborepo), shared `tsconfig`, lint, env loading.
- Provision Postgres + `pgvector`, Redis. Drizzle schema + migrations for
  `credentials`, `documents` (vectorized), `events`, `jobs`.
- Wire the event bus (BullMQ) with one no-op worker end-to-end.
- **Exit criteria:** an event published from the API runs a worker and writes a row.

### Phase 1 — Brisk Camel (the scraper)
- Playwright harness with a **session/credential manager** and **captcha solver
  via Claude vision**.
- Implement the read flows first (lowest risk, no side effects):
  `getEmitedInvoices` → `getReceiptInvoices` → `generateCSF`.
- Each flow emits `*.succeeded` / `*.failed` events with a normalized payload and
  raw artifacts (HTML/PDF) stored.
- **Exit criteria:** read flows return normalized data for a real test RFC.

### Phase 2 — Agent + tools
- Claude agent (`claude-opus-4-8`, adaptive thinking) with the four tools defined
  in [04-skills.md](./04-skills.md). Tools enqueue events and await results.
- Result normalization layer; confirmation gate for `generateInvoice`.
- **Exit criteria:** "muéstrame mis facturas de mayo" → tool call → scraped data → spoken+visual answer.

### Phase 3 — Voice
- ElevenLabs Conversational AI front; Whisper for transcription fallback.
- Stream agent actions to the UI over SSE/WebSocket so the user sees the agent work.
- **Exit criteria:** full voice round-trip on a read flow.

### Phase 4 — RAG + dynamic UI
- Embed stored documents (Voyage) → pgvector. RAG client answers
  "what's my situation / what do I owe / what's due".
- Régimen-aware UI: detect régimen from CSF, render the matching report set.
- **Exit criteria:** "¿qué se me viene este mes?" returns a grounded, cited answer; UI adapts to régimen.

### Phase 5 — `generateInvoice` + polish
- The write flow with the confirmation gate, *vista previa* extraction, **no blind emission**.
- Demo script, error theater (show resilience: a captcha retry, a timeout recovery).
- **Exit criteria:** end-to-end invoice issuance from voice, confirmed, with the CFDI returned.

## 1.5 Demo path

1. User calls in: *"¿Qué facturas emití en mayo?"* → agent scrapes, answers by voice, UI renders the table.
2. *"Bájame mi constancia de situación fiscal."* → CSF PDF appears; régimen detected; UI reshapes. An insight of the document is given via voice (i.e. "Tu régimen es RESOCP, estás al día con tus obligaciones fiscales").
3. *"¿Hay algo que deba revisar?"* → RAG client: grounded recommendation from their real data.
4. *"Emíteme una factura a Acme, 10,000 más IVA, uso G03."* → agent fills the form, shows *vista previa*, **asks to confirm**, then emits.

## 1.6 Risks & mitigations

| Risk | Mitigation |
|------|------------|
| SAT captcha (alphanumeric image) | Solve with Claude vision; retry with fresh captcha on failure; cap attempts |
| SAT portal changes / flakiness | Selectors centralized + versioned; every flow idempotent and replayable from stored events |
| Slow scraping blocks UX | Async event model; stream progress to UI; optimistic "working…" states |
| Wrong invoice emitted | Hard confirmation gate; extract *vista previa*; never click "emit" without explicit user yes |
| Credential security | Encrypted at rest; never in prompts/logs; see [07-security.md](./07-security.md) |
| Hallucinated tax advice | RAG answers cite stored documents; agent constrained to tool outputs |
