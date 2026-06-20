# 5 · Data Model, Vectorization & RAG

## 5.1 Data model (Drizzle / Postgres)

```
users          (id, email, display_name, created_at)
credentials    (id, user_id, rfc, enc_password, enc_cer, enc_key, kind, created_at)
                 -- kind: 'ciec' (RFC+contraseña) | 'efirma' (.cer/.key)
                 -- enc_* are sealed blobs; decrypted only in-worker. See 07-security.md

events         (id, correlation_id, user_id, rfc, name, payload jsonb,
                status, created_at)            -- append-only event log
jobs           (id, queue, event_id, attempts, last_error, created_at, finished_at)

documents      (id, user_id, rfc, type, source_event_id,
                title, body text, metadata jsonb,
                embedding vector(1024),         -- pgvector; Voyage voyage-3 dims
                artifact_id, created_at)
                 -- type: 'invoice_emitted' | 'invoice_received' | 'csf' |
                 --       'invoice_preview' | 'invoice_issued'
artifacts      (id, document_id, kind, storage_url, sha256)  -- raw HTML/PDF/screenshot
reports        (id, user_id, regimen, layout jsonb, created_at) -- cached régimen-aware UI specs
```

Notes:
- `documents` is the unit of both relational query and RAG retrieval — one row per
  invoice / CSF / preview, with structured `metadata` *and* an `embedding`.
- Raw scraper output (HTML/PDF/screenshot) goes to `artifacts` (object storage),
  kept out of the hot query path but available for replay/debug.
- Everything is keyed by `rfc` + `user_id` for tenant isolation and fast filtering.

## 5.2 Indexing

- `documents`: HNSW index on `embedding` for ANN; btree on `(user_id, rfc, type, created_at)`
  for filtered queries ("facturas emitidas de mayo").
- `events`: btree on `(correlation_id)` and `(user_id, name, created_at)`.
- Vector search is **always filtered** by `user_id`/`rfc` first (metadata filter +
  ANN), never global.

## 5.3 Vectorization pipeline

Triggered by an `embed` job after any `scrape.*.succeeded` that produced documents:

1. **Build a retrieval text** per document — a compact, embedding-friendly
   rendering, e.g. for an invoice:
   `"Factura emitida UUID … a {receptor} por {total} MXN (IVA {iva}) el {fecha}, {tipoComprobante}, {estado}."`
   For a CSF: régimen(es), domicilio, obligaciones and due dates flattened to text.
2. **Embed** with Voyage (`voyage-3`, 1024-d) — batch where possible.
3. **Upsert** into `documents.embedding` with metadata for filtering.

We embed the *normalized* text, not raw HTML — cleaner vectors, smaller cost.

## 5.4 RAG client

The RAG client answers situational questions grounded in the user's real, stored
data: *"¿qué se me viene este mes?"*, *"¿cuánto facturé en mayo?"*, *"¿tengo
facturas canceladas que afecten mi declaración?"*

Flow:
1. **Retrieve:** hybrid — metadata filter (`user_id`, `rfc`, `type`, date) +
   vector ANN over `documents`. Pull the top-k plus any deterministic aggregates
   (e.g. sum of `total` over a period) computed in SQL.
2. **Ground:** pass retrieved documents to Claude (`claude-opus-4-8`) as context
   using the **Files/citations**-style grounding so the answer cites the actual
   documents it used.
3. **Profile-aware:** the user's `regimen` (from the latest CSF) is injected as
   context so recommendations match their obligations (e.g. RESICO vs. Actividad
   Empresarial deadlines differ).
4. **Recommend, don't advise blindly:** the assistant frames reminders/
   recommendations and always shows the underlying figures; it never invents
   amounts or deadlines not present in the data.

### Why RAG and not just SQL
Aggregates ("how much did I bill") are SQL. But "what should I review given my
situation" needs semantic recall across heterogeneous documents (CSF obligations,
invoice anomalies, patterns) + the user's profile — that's the RAG client's job.
We use SQL for exact figures and RAG for the reasoning/recall layer, and feed both
to the agent.

## 5.5 Embedding hygiene & cost

- Re-embed only on document change; embeddings are content-addressed by `sha256`
  of the retrieval text to skip no-op re-embeds.
- Batch embed jobs; cap concurrency.
- Prompt-cache the RAG system prompt; only the retrieved context varies per query.
