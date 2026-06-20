import type { Browser, BrowserContext, Page } from "playwright";
import { uuid, childLogger } from "@sat/shared";
import type {
  BrowserDriver,
  Session,
  UploadFile,
  Download,
  WaitOpts,
  ClickOpts,
} from "../types.js";

/** Local Playwright backend. Credentials never leave our infra with this driver. */
export class PlaywrightDriver implements BrowserDriver {
  readonly name = "playwright" as const;
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    const { chromium } = await import("playwright");
    // HEADED=1 → watch the browser drive the SAT (great for debugging selectors).
    const headed = process.env.HEADED === "1" || process.env.HEADED === "true";
    this.browser = await chromium.launch({
      headless: !headed,
      slowMo: headed ? 250 : 0,
      args: [
        "--no-sandbox",               // required in Docker (no user namespace)
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",    // /dev/shm is 64 MB in Docker → crashes without this
        "--disable-gpu",              // no GPU in headless containers
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
        "--no-zygote",                // reduces child process overhead in constrained envs
      ],
    });
    return this.browser;
  }

  async createSession(opts: { rfc: string; correlationId: string }): Promise<Session> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: "es-MX",
    });
    const page = await context.newPage();
    return new PlaywrightSession(uuid(), context, page);
  }
}

/**
 * A Playwright-backed Session. The browser may be local (PlaywrightDriver) or a
 * remote managed browser reached over CDP (FirecrawlDriver) — the logic is
 * identical, so both drivers share this class. `opts.liveView` exposes a hosted
 * live-view URL (Firecrawl); `opts.cleanup` overrides teardown (disconnect CDP +
 * release the remote session) instead of just closing the local context.
 */
export class PlaywrightSession implements Session {
  constructor(
    readonly id: string,
    private context: BrowserContext,
    private page: Page,
    private opts: { liveView?: string | null; cleanup?: () => Promise<void> } = {},
  ) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }
  url(): string {
    return this.page.url();
  }
  async click(selector: string, opts: ClickOpts = {}): Promise<void> {
    await this.page.click(selector, { timeout: opts.timeoutMs });
  }
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }
  async type(selector: string, value: string, opts: { delayMs?: number } = {}): Promise<void> {
    await this.page.type(selector, value, { delay: opts.delayMs });
  }
  async selectOption(selector: string, value: string): Promise<void> {
    // SAT <select> option values often differ from the visible label — try both.
    // SAT things...
    try {
      await this.page.selectOption(selector, value);
    } catch {
      await this.page.selectOption(selector, { label: value });
    }
  }
  async setInputFiles(selector: string, files: UploadFile[]): Promise<void> {
    await this.page.setInputFiles(
      selector,
      files.map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: f.buffer })),
    );
  }
  async waitFor(selector: string, opts: WaitOpts = {}): Promise<void> {
    await this.page.waitForSelector(selector, {
      timeout: opts.timeoutMs ?? 15000,
      state: opts.state ?? "visible",
    });
  }
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("load");
  }
  async waitForHidden(selector: string, opts: WaitOpts = {}): Promise<void> {
    await this.page
      .waitForSelector(selector, { timeout: opts.timeoutMs ?? 15000, state: "hidden" })
      .catch(() => void 0);
  }
  async innerText(selector: string): Promise<string> {
    return this.page.innerText(selector);
  }
  async getAttribute(selector: string, attr: string): Promise<string | null> {
    return this.page.getAttribute(selector, attr);
  }
  async inputValue(selector: string): Promise<string> {
    return this.page.locator(selector).first().inputValue();
  }
  async isEditable(selector: string): Promise<boolean> {
    return this.page
      .locator(selector)
      .first()
      .isEditable({ timeout: 2000 })
      .catch(() => false);
  }
  async exists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }
  async screenshot(selector?: string): Promise<Buffer> {
    if (selector) return this.page.locator(selector).first().screenshot();
    return this.page.screenshot();
  }
  async captureDownload(trigger: () => Promise<void>, timeoutMs = 90_000): Promise<Download> {
    const log = childLogger({ op: "captureDownload" });
    const ctx = this.context;
    const page = this.page;
    // Headless Chromium serves a PDF in THREE different ways depending on the SAT
    // response headers: (a) a real `download` event (Content-Disposition: attachment),
    // (b) a popup/new tab rendering it inline, or (c) the CURRENT tab navigating to the
    // PDF URL inline. The old code only handled (a)+(b) → headless timed out on (c).
    // Race all three and return whichever fires first. Inline PDFs are re-fetched with
    // the session cookies via context.request.
    const startUrl = page.url();
    const before = new Set(ctx.pages().map((p) => p.url()));
    log.info({ timeoutMs }, "waiting for download/popup/inline-pdf after trigger");

    const fetchPdf = async (url: string, via: string): Promise<Download | null> => {
      if (!url || url === "about:blank") return null;
      const resp = await ctx.request.get(url).catch(() => null);
      if (!resp) return null;
      const buffer = Buffer.from(await resp.body());
      const isPdf =
        (resp.headers()["content-type"] ?? "").includes("pdf") ||
        buffer.subarray(0, 5).toString("latin1") === "%PDF-";
      if (!isPdf) return null;
      log.info({ via, url, bytes: buffer.length, status: resp.status() }, "inline PDF fetched");
      return { buffer, filename: "documento.pdf" };
    };

    const viaDownload = async (): Promise<Download | null> => {
      const d = await page.waitForEvent("download", { timeout: timeoutMs }).catch(() => null);
      if (!d) return null;
      const filename = d.suggestedFilename();
      const stream = await d.createReadStream();
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      const buffer = Buffer.concat(chunks);
      log.info({ via: "download", filename, bytes: buffer.length }, "download captured");
      return { buffer, filename };
    };

    const viaPopup = async (): Promise<Download | null> => {
      const p = await page.waitForEvent("popup", { timeout: timeoutMs }).catch(() => null);
      if (!p) return null;
      await p.waitForLoadState("domcontentloaded").catch(() => void 0);
      return fetchPdf(p.url(), "popup");
    };

    // (c) Poll for the PDF opening in the same tab or any new page in the context.
    const viaInlineNav = async (): Promise<Download | null> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        for (const p of ctx.pages()) {
          const u = p.url();
          const isNewPage = !before.has(u);
          const movedSameTab = p === page && u !== startUrl;
          if (isNewPage || movedSameTab) {
            const dl = await fetchPdf(u, p === page ? "same-tab" : "new-page");
            if (dl) return dl;
          }
        }
        await page.waitForTimeout(500);
      }
      return null;
    };

    await trigger();
    const result = await firstTruthy([viaDownload(), viaPopup(), viaInlineNav()], timeoutMs + 1000);
    if (result) return result;

    log.error("no download/popup/inline PDF after trigger (timed out)");
    throw new Error("captureDownload: no se obtuvo el PDF (ni download, ni popup, ni inline)");
  }
  async evaluate<T>(expression: string): Promise<T> {
    return this.page.evaluate(expression) as Promise<T>;
  }
  async liveViewUrl(): Promise<string | null> {
    return this.opts.liveView ?? null; // local Playwright has none; Firecrawl sets it.
  }
  async close(): Promise<void> {
    if (this.opts.cleanup) {
      await this.opts.cleanup();
      return;
    }
    await this.context.close();
  }
}

/**
 * Resolves with the first promise to yield a truthy value; if all resolve falsy
 * (or reject), resolves null. A hard `timeoutMs` guards against a strategy that
 * never settles. Used to race the download-capture strategies.
 */
function firstTruthy<T>(promises: Promise<T | null>[], timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    let settled = false;
    const finish = (v: T | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    for (const p of promises) {
      p.then(
        (v) => (v ? finish(v) : --pending === 0 && finish(null)),
        () => --pending === 0 && finish(null),
      );
    }
    setTimeout(() => finish(null), timeoutMs);
  });
}
