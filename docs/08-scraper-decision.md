# 8 · Decision Record — Scraper backend (Firecrawl vs. Playwright)

## Context

Brisk Camel must drive the SAT portals: authenticated, stateful, multi-step,
captcha-gated, form-filling (issuing CFDIs), and PDF-producing (CSF, *vista
previa*). We have **unlimited Firecrawl credits**. Question: Firecrawl or
self-hosted Playwright?

## Findings (from Firecrawl docs)

- Firecrawl's `scrape` / `crawl` / `map` / `search` are **content extraction** —
  not usable for stateful, authenticated, write flows.
- Firecrawl **`/interact`** is the relevant endpoint and is effectively **managed
  Playwright**:
  - Stateful session across calls (cookies, localStorage); chain calls on the same `scrapeId`.
  - **Named profiles** persist login across sessions (login once, reuse).
  - **Full Playwright access** via code execution (Node/Python) — pre-connected `page` object.
  - Click/type/fill/submit/wait/screenshot/`executeJavascript`.
  - **Interactive live-view stream**: a human can take over the browser (captcha/2FA).
  - **No automatic captcha solving** (human live-view is the intended path).
  - Limits: 10-min TTL, 5-min inactivity; credits 2/min code-only, 7/min with AI prompts.
  - **PDF download via interact: not documented → must verify.**

Refs:
[introduction](https://docs.firecrawl.dev/api-reference/introduction) ·
[interact](https://docs.firecrawl.dev/features/interact) ·
[interact announcement](https://www.firecrawl.dev/blog/introducing-interact-endpoint)

## Decision

**Use Firecrawl `/interact` as the primary browser driver, behind a thin
`BrowserDriver` abstraction** in `packages/scraper`, so the same flow code can run
on Firecrawl now or self-hosted Playwright later.

### Why Firecrawl primary (for the hackathon)
- **Zero browser ops** — no headless-Chromium-in-a-container deploy/scale.
- **Managed anti-bot/proxy infra** — SAT is hostile to datacenter automation; this
  is otherwise our problem to solve.
- **Unlimited credits** — cost is a non-issue.
- **Live-view human takeover** — a captcha/2FA safety net *and* an on-brand
  "New Interfaces" demo moment.
- Flow code is just Playwright, so it ports to either backend.

### Captcha strategy (unchanged, layered)
1. Screenshot the captcha via the driver → solve with **Claude vision** → type it.
2. On repeated failure → surface the **interactive live-view** to the user to solve
   it themselves. (Best of both; works on either backend.)

## The abstraction

```ts
// packages/scraper/driver.ts
export interface BrowserDriver {
  session(rfc: string): Promise<Session>;        // creates/reuses a stateful session
}
export interface Session {
  goto(url: string): Promise<void>;
  click(sel: string): Promise<void>;
  type(sel: string, text: string): Promise<void>;
  waitFor(sel: string): Promise<void>;
  screenshot(sel?: string): Promise<Buffer>;     // for captcha → Claude vision
  download(trigger: () => Promise<void>): Promise<Buffer>; // PDF capture
  liveViewUrl(): Promise<string | null>;         // human takeover (Firecrawl only)
  eval<T>(fn: string): Promise<T>;
  close(): Promise<void>;
}
// Implementations: FirecrawlDriver (primary) · PlaywrightDriver (fallback/prod)
```

Flows in `packages/scraper` are written against `Session`, never a concrete backend.

## Open verification items (Phase 1, before committing fully)

1. **PDF capture in `/interact`** (CSF + *vista previa*). If unsupported:
   fetch the PDF URL with the live session cookies (code-exec mode), or route only
   `generateCSF`/`generateInvoice` to `PlaywrightDriver`.
2. **Session TTL vs. human takeover** — confirm a paused captcha solve fits inside
   the 10-min TTL / 5-min idle window; bump/keepalive if needed.
3. **e.firma `.cer/.key`** — if a flow needs client-cert auth, confirm how to
   supply it to a Firecrawl session (may force `PlaywrightDriver` for that flow).

## Trade-off accepted

With Firecrawl, SAT credentials transit a third-party browser. Acceptable for a
demo on our own/test RFC. For production at scale, flip the `BrowserDriver` to
self-hosted Playwright so credentials never leave our infra (see
[07-security.md](./07-security.md)). The abstraction makes this a config change,
not a rewrite.
