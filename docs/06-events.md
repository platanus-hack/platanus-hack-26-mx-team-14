# 6 · Event Catalog & Contracts

The system is event-driven: the agent emits request events, workers emit result
events, and everything is persisted to the `events` log. Contracts live in
`packages/events` as Zod schemas so producers and consumers can't drift.

## 6.1 Event envelope

```ts
type EventEnvelope<TName extends string, TBody> = {
  id: string;             // ulid
  name: TName;            // e.g. "scrape.getEmitedInvoices.requested"
  correlationId: string;  // ties request → result(s) → logs/traces
  userId: string;
  rfc: string;
  idempotencyKey: string; // dedupe duplicate requests
  body: TBody;
  ts: string;             // ISO timestamp
};
```

Every event is appended to the `events` table; queues carry the same envelope.

## 6.2 Catalog

| Event | Producer | Consumer | Body (summary) |
|---|---|---|---|
| `scrape.getEmitedInvoices.requested` | agent | worker | `{ from, to, filters? }` |
| `scrape.getEmitedInvoices.succeeded` | worker | agent, embedder | `{ invoices: Invoice[], documentIds }` |
| `scrape.getEmitedInvoices.failed` | worker | agent | `{ reason, retryable, artifactId? }` |
| `scrape.getReceiptInvoices.requested` | agent | worker | `{ from, to, filters? }` |
| `scrape.getReceiptInvoices.succeeded` | worker | agent, embedder | `{ invoices, documentIds }` |
| `scrape.getReceiptInvoices.failed` | worker | agent | `{ reason, retryable }` |
| `scrape.generateCSF.requested` | agent | worker | `{}` |
| `scrape.generateCSF.succeeded` | worker | agent, embedder | `{ csf: CSF, documentId, artifactId }` |
| `scrape.generateCSF.failed` | worker | agent | `{ reason, retryable }` |
| `scrape.generateInvoice.requested` | agent | worker | `{ receptor, conceptos, moneda?, tipoCambio?, confirmed }` |
| `scrape.generateInvoice.previewed` | worker | agent | `{ preview: InvoicePreview, artifactId }` |
| `scrape.generateInvoice.succeeded` | worker | agent, embedder | `{ uuid, documentId, artifactId }` |
| `scrape.generateInvoice.failed` | worker | agent | `{ reason, retryable, step }` |
| `embed.requested` | worker | embedder | `{ documentIds }` |
| `embed.succeeded` | embedder | — | `{ documentIds }` |
| `captcha.solved` / `captcha.failed` | worker | (internal) | `{ attempts }` — telemetry |
| `agent.action` | agent | web (SSE) | `{ kind, label, status }` — UI progress |

## 6.3 Request → result correlation

The agent tool handler:
1. computes `idempotencyKey` from `(userId, op, normalizedArgs)`,
2. publishes `scrape.<op>.requested`,
3. subscribes for `scrape.<op>.{succeeded|failed}` (and `.previewed` for invoices)
   with the same `correlationId`, with a deadline,
4. returns the result (or a structured failure) to the Claude tool loop.

## 6.4 The invoice confirmation handshake

```
agent ──generateInvoice(confirmed:false)──▶ requested
worker ── builds form, extracts vista previa ──▶ previewed
agent ── shows/speaks preview, asks user ──▶ (waits for human)
user  ── "sí, emítela"
agent ──generateInvoice(confirmed:true, same args)──▶ requested
worker ── clicks emit ──▶ succeeded {uuid}
```

A `requested` with `confirmed:false` **never** clicks the final emit button.

## 6.5 Failure semantics

- `failed.retryable=true` → agent may offer to retry; the bus has already retried
  transient errors per backoff policy before surfacing.
- `failed.retryable=false` (e.g. bad credentials, validation error) → surface to
  the user with the reason; do not auto-retry.
- Every `failed` carries the `artifactId` of the captured page state when available,
  so the failure is debuggable and the flow replayable.

## 6.6 Replay & idempotency

- The `events` log is append-only; a normalizer/embedder bug can be fixed and the
  stored raw artifacts re-processed without re-hitting SAT.
- `idempotencyKey` makes duplicate `requested` events no-ops (important when voice
  produces stutters/duplicates).
