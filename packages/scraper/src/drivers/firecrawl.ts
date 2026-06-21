import { env, childLogger } from "@sat/shared";
import type { BrowserDriver, Session } from "../types.js";
import { PlaywrightSession } from "./playwright.js";

/**
 * Firecrawl managed-browser backend. We provision a session via `POST /v2/interact`
 * (anti-bot infra + hosted live-view for human captcha/2FA takeover), then drive it
 * as an ordinary Playwright browser over CDP (`chromium.connectOverCDP(cdpUrl)`).
 *
 * Because CDP gives us a real Playwright `page`, every Session method — including
 * captureDownload — is shared with the local PlaywrightDriver via PlaywrightSession.
 * No bespoke REST/code-exec contract. See https://docs.firecrawl.dev (v2 Browser/Interact).
 *
 * e.firma (.cer/.key upload) still routes to PlaywrightDriver so private-key material
 * never leaves our infra.
 */
const BASE = "https://api.firecrawl.dev";

interface InteractSession {
  success?: boolean;
  id?: string;
  cdpUrl?: string;
  liveViewUrl?: string;
  interactiveLiveViewUrl?: string;
  expiresAt?: string;
}

export class FirecrawlDriver implements BrowserDriver {
  readonly name = "firecrawl" as const;

  private headers(): Record<string, string> {
    if (!env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not set");
    return {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async createSession(opts: { rfc: string; correlationId: string }): Promise<Session> {
    const log = childLogger({ correlationId: opts.correlationId, op: "firecrawl.createSession" });

    // 1) Provision the managed browser session.
    const res = await fetch(`${BASE}/v2/interact`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        ttl: 600, // up to 10 min — covers login + captcha + download
        activityTtl: 180, // idle timeout between actions
        // Read the per-RFC profile (cookies/localStorage) but DON'T take the writer
        // lock: saveChanges:true makes concurrent/retried jobs collide with a 409
        // ("Another session is currently writing to this profile"). Reading is enough.
        profile: { name: `sat-${opts.rfc}`, saveChanges: false },
      }),
    });
    if (!res.ok) {
      throw new Error(`Firecrawl interact create failed: ${res.status} ${await res.text()}`);
    }
    const session = (await res.json()) as InteractSession;
    if (!session.id || !session.cdpUrl) {
      throw new Error(`Firecrawl returned no id/cdpUrl: ${JSON.stringify(session)}`);
    }
    const liveView = session.interactiveLiveViewUrl ?? session.liveViewUrl ?? null;
    log.info({ sessionId: session.id, liveView }, "firecrawl session ready, connecting over CDP");

    // 2) Attach Playwright to it over CDP — now it's a normal Playwright session.
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(session.cdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext({ acceptDownloads: true }));
    const page = context.pages()[0] ?? (await context.newPage());
    log.info({ sessionId: session.id }, "CDP connected");

    // 3) Teardown: disconnect CDP, then release the remote session.
    const cleanup = async () => {
      await browser.close().catch(() => void 0);
      await fetch(`${BASE}/v2/interact/${session.id}`, {
        method: "DELETE",
        headers: this.headers(),
      }).catch(() => void 0);
    };

    return new PlaywrightSession(session.id, context, page, { liveView, cleanup });
  }
}
