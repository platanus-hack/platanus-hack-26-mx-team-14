# 7 · Security, Credentials & Compliance

We handle highly sensitive material: SAT passwords (CIEC), the **e.firma**
(`.cer`/`.key` + key password), and a person's full tax history. This is the part
to get right even at hackathon pace.

## 7.1 Credentials at rest

- **Two credential kinds:**
  - `ciec` — RFC + *Contraseña* (CIEC), used for the portal flows.
  - `efirma` — `.cer` + `.key` + key password, used where e.firma is required.
- **Encrypted at rest** with authenticated encryption (libsodium `crypto_secretbox`
  / AES-256-GCM). The data key is held outside the DB (env-injected KMS-style key
  for the hackathon; a real KMS in production).
- Stored as sealed blobs in `credentials.enc_*`. The DB never sees plaintext.

## 7.2 Credentials in use

- Decrypted **only inside the worker**, **in memory**, for the duration of a single
  Brisk Camel flow; never written to disk, never logged, never put in an LLM prompt.
- The `.key`/password are passed to Playwright/Node directly; they do not transit
  the agent or the API request path.
- Browser sessions are per-RFC, short-TTL, and torn down after use.

## 7.3 The captcha & the model boundary

- Captchas are solved by sending **only the captcha image** to Claude vision —
  never the surrounding page, credentials, or PII.
- The agent prompt and RAG context contain **normalized tax documents**, never
  passwords, `.key` material, or the captcha-solving path.

## 7.4 Logging & telemetry

- Pino redaction list covers `password`, `enc_*`, `.key`, `contraseña`, and any
  field tagged sensitive. Logs carry `correlationId`/`rfc` for tracing, not secrets.
- Raw artifacts (HTML/PDF/screenshots) may contain PII → stored in access-controlled
  object storage, scoped per `user_id`, with signed, expiring URLs.

## 7.5 The write-action safety gate

- `generateInvoice` is the only side-effecting skill. It **cannot** emit without a
  `confirmed:true` call that follows an explicit, in-conversation human "yes" after
  seeing the *vista previa*. The agent is instructed never to self-confirm; the
  worker never clicks emit on a `confirmed:false` request. See [04-skills.md](./04-skills.md) §4.2.

## 7.6 Tenancy & data scope

- Every query (relational and vector) is filtered by `user_id`/`rfc` first. No
  cross-tenant retrieval, ever.
- The RAG client answers only from the requesting user's documents.

## 7.7 Honesty constraints on the AI

- The assistant cites stored documents for any figure or deadline; it does not
  invent amounts, due dates, or tax advice not present in the data.
- On scraper failure it reports the failure truthfully (with reason) rather than
  fabricating a plausible result.

## 7.8 Authorization & ethics

- Built for users acting on **their own** SAT accounts with their own credentials —
  an assistive interface to a service they're already entitled to use.
- Respect SAT rate limits; per-RFC throttling avoids account lockouts and undue load.

## 7.9 Browser backend & credential trust

Brisk Camel runs on a `BrowserDriver` abstraction with two backends (see
[08-scraper-decision.md](./08-scraper-decision.md)):

- **Firecrawl `/interact` (hackathon primary):** the SAT login happens in
  Firecrawl's managed browser, so credentials transit a third party. **Accepted
  trade-off for a demo on our own/test RFC** — in exchange for managed anti-bot
  infra, zero browser ops, and human live-view captcha takeover.
- **Self-hosted Playwright (production path):** credentials are decrypted only
  in-worker and never leave our infra (§7.2). For production at scale, flip the
  driver to Playwright; the flow code is unchanged.

If a flow needs the **e.firma `.cer/.key`**, prefer the Playwright backend for that
flow so private-key material never leaves our infra.

## 7.10 Hackathon → production gap (known)

For the demo we accept: env-injected master key (vs. real KMS), single workspace,
demo-grade auth on the `frontend` app, and credentials transiting Firecrawl (§7.9).
Documented here so each is a deliberate, visible trade-off rather than an oversight.
