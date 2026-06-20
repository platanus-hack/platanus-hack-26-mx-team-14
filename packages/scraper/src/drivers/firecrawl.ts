import { env } from "@sat/shared";
import type {
  BrowserDriver,
  Session,
  UploadFile,
  Download,
  WaitOpts,
  ClickOpts,
} from "../types.js";

/**
 * Firecrawl `/interact` backend — managed Playwright with a stateful session,
 * anti-bot infra, and a live-view stream for human captcha/2FA takeover.
 *
 * It exposes a pre-connected Playwright `page` via code execution, so each Session
 * method maps to a small snippet run against `page`. See docs/08-scraper-decision.md.
 *
 * OPEN VERIFICATION ITEMS (Phase 1):
 *   - captureDownload(): PDF capture via /interact is undocumented. Two candidate
 *     paths are stubbed below; one must be confirmed before CSF/generateInvoice
 *     run on this driver (otherwise route those flows to PlaywrightDriver).
 */
const BASE = "https://api.firecrawl.dev";

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
    // Open a scrape session we can attach /interact calls to. A blank page is fine;
    // flows call goto() to the SAT URL. Persist login via a per-RFC named profile.
    const res = await fetch(`${BASE}/v2/scrape`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        url: "about:blank",
        // Persist cookies/localStorage across sessions → login once, reuse.
        profile: { name: `sat-${opts.rfc}`, saveChanges: true },
        // Keep the browser open for /interact follow-ups.
        interact: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Firecrawl scrape create failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { scrapeId?: string; id?: string };
    const scrapeId = json.scrapeId ?? json.id;
    if (!scrapeId) throw new Error("Firecrawl returned no scrapeId");
    return new FirecrawlSession(scrapeId, this.headers());
  }
}

class FirecrawlSession implements Session {
  private lastLiveView: string | null = null;
  private currentUrl = "about:blank";

  constructor(
    readonly id: string,
    private hdrs: Record<string, string>,
  ) {}

  /** Run Node/Playwright code against the live `page`; returns `result` JSON. */
  private async exec<T>(code: string): Promise<T> {
    const res = await fetch(`${BASE}/v2/scrape/${this.id}/interact`, {
      method: "POST",
      headers: this.hdrs,
      body: JSON.stringify({ code, language: "node" }),
    });
    if (!res.ok) {
      throw new Error(`Firecrawl interact failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      result?: unknown;
      liveViewUrl?: string;
      interactiveStreamUrl?: string;
    };
    this.lastLiveView = json.interactiveStreamUrl ?? json.liveViewUrl ?? this.lastLiveView;
    return json.result as T;
  }

  async goto(url: string): Promise<void> {
    this.currentUrl = url;
    await this.exec(`await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded' });`);
  }
  url(): string {
    return this.currentUrl;
  }
  async click(selector: string, opts: ClickOpts = {}): Promise<void> {
    const clickOpts = opts.timeoutMs ? `, { timeout: ${opts.timeoutMs} }` : "";
    await this.exec(`await page.click(${JSON.stringify(selector)}${clickOpts});`);
  }
  async fill(selector: string, value: string): Promise<void> {
    await this.exec(`await page.fill(${JSON.stringify(selector)}, ${JSON.stringify(value)});`);
  }
  async type(selector: string, value: string): Promise<void> {
    await this.exec(`await page.type(${JSON.stringify(selector)}, ${JSON.stringify(value)});`);
  }
  async selectOption(selector: string, value: string): Promise<void> {
    await this.exec(
      `await page.selectOption(${JSON.stringify(selector)}, ${JSON.stringify(value)});`,
    );
  }
  async setInputFiles(_selector: string, _files: UploadFile[]): Promise<void> {
    // e.firma upload into a managed browser is an OPEN ITEM — prefer PlaywrightDriver
    // for .cer/.key flows so private-key material never leaves our infra.
    throw new Error(
      "setInputFiles not supported on FirecrawlDriver — route e.firma flows to PlaywrightDriver",
    );
  }
  async waitFor(selector: string, opts: WaitOpts = {}): Promise<void> {
    await this.exec(
      `await page.waitForSelector(${JSON.stringify(selector)}, { timeout: ${
        opts.timeoutMs ?? 15000
      }, state: ${JSON.stringify(opts.state ?? "visible")} });`,
    );
  }
  async waitForLoad(): Promise<void> {
    await this.exec(`await page.waitForLoadState('networkidle');`);
  }
  async waitForHidden(selector: string, opts: WaitOpts = {}): Promise<void> {
    await this.exec(
      `try { await page.waitForSelector(${JSON.stringify(selector)}, { timeout: ${
        opts.timeoutMs ?? 15000
      }, state: 'hidden' }); } catch {}`,
    );
  }
  async innerText(selector: string): Promise<string> {
    return this.exec<string>(`return await page.innerText(${JSON.stringify(selector)});`);
  }
  async getAttribute(selector: string, attr: string): Promise<string | null> {
    return this.exec<string | null>(
      `return await page.getAttribute(${JSON.stringify(selector)}, ${JSON.stringify(attr)});`,
    );
  }
  async exists(selector: string): Promise<boolean> {
    return this.exec<boolean>(
      `return (await page.locator(${JSON.stringify(selector)}).count()) > 0;`,
    );
  }
  async screenshot(selector?: string): Promise<Buffer> {
    const code = selector
      ? `return (await page.locator(${JSON.stringify(selector)}).first().screenshot()).toString('base64');`
      : `return (await page.screenshot()).toString('base64');`;
    const b64 = await this.exec<string>(code);
    return Buffer.from(b64, "base64");
  }
  async captureDownload(_trigger: () => Promise<void>): Promise<Download> {
    // OPEN ITEM. Candidate path: in code-exec, `page.on('download')` + read the
    // download stream, OR fetch the PDF URL with the session's cookies. Verify in
    // the spike (src/spikes/firecrawl-pdf.ts) before relying on this.
    throw new Error(
      "captureDownload not yet verified on FirecrawlDriver — see docs/08-scraper-decision.md §Open items",
    );
  }
  async evaluate<T>(expression: string): Promise<T> {
    return this.exec<T>(`return await page.evaluate(${JSON.stringify(expression)});`);
  }
  async liveViewUrl(): Promise<string | null> {
    return this.lastLiveView;
  }
  async close(): Promise<void> {
    await fetch(`${BASE}/v2/scrape/${this.id}/interact`, {
      method: "DELETE",
      headers: this.hdrs,
    }).catch(() => void 0);
  }
}
