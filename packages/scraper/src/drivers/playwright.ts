import type { Browser, BrowserContext, Page, Download as PwDownload } from "playwright";
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
    // Two independent knobs:
    //   HEADED=1      → visible window + slowMo, to watch it drive the SAT locally.
    //   SAT_HEADFUL=1 → real (non-headless) Chromium with NO visible window, rendered
    //                   to a virtual display (Xvfb) in Docker. The SAT logs a HEADLESS
    //                   browser out on the CSF download click (bounces to iniciar-sesion),
    //                   so the worker/prod must run non-headless to match local behavior.
    const isOn = (v: string | undefined) => v === "1" || v === "true";
    const visible = isOn(process.env.HEADED);
    let headful = visible || isOn(process.env.SAT_HEADFUL);

    // Safety: if we're trying to run headful but there's no X server, force headless
    // (Xvfb not available or not set up). This prevents "Missing X server" crashes.
    if (headful && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      console.warn(
        "[Playwright] SAT_HEADFUL=1 but no X11/Wayland display available. " +
        "Forcing headless mode. Install Xvfb or set DISPLAY to run headed browser."
      );
      headful = false;
    }
    this.browser = await chromium.launch({
      headless: !headful,
      slowMo: visible ? 250 : 0,
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
        // Headless server fixes (no X11, no D-Bus)
        "--disable-crash-reporter",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        // Anti-automation: the SAT invalidates the session right after login on Linux
        // (bounces to /iniciar-sesion) but not on macOS. These hide the most common
        // automation tells so the portal treats us like a normal Chrome.
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
    return this.browser;
  }

  async createSession(opts: { rfc: string; correlationId: string }): Promise<Session> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      acceptDownloads: true,
      locale: "es-MX",
      timezoneId: "America/Mexico_City",
      // A real desktop Chrome UA on Linux (Playwright's default Chromium UA can carry
      // tells the SAT keys off). Keep the major version in sync with the base image.
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    // Mask the headless/automation fingerprint before any SAT script runs.
    await context.addInitScript(
      "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });" +
        "window.chrome = window.chrome || { runtime: {} };" +
        "Object.defineProperty(navigator, 'languages', { get: () => ['es-MX', 'es'] });" +
        "Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });",
    );
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
    await this.page.click(selector, { timeout: opts.timeoutMs, force: opts.force });
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
  async screenshot(selector?: string, opts: { fullPage?: boolean } = {}): Promise<Buffer> {
    if (selector) return this.page.locator(selector).first().screenshot();
    return this.page.screenshot({ fullPage: opts.fullPage });
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

    // DIAGNOSTICS: the SAT serves the CSF differently across environments (macOS vs
    // Linux/Xvfb). Log every page/popup, every download event, and what the trigger
    // does — so we see the actual mechanism instead of guessing which strategy to use.
    page.on("popup", (p) => log.info({ url: p.url() }, "DIAG popup event on main page"));
    page.on("download", (d) =>
      log.info({ filename: d.suggestedFilename() }, "DIAG download event on MAIN page"));
    page.on("filechooser", () => log.info("DIAG filechooser on main page"));
    page.on("dialog", (d) =>
      log.info({ type: d.type(), message: d.message() }, "DIAG js dialog on main page"));
    ctx.on("page", (p) => {
      log.info({ url: p.url() }, "DIAG new page/popup opened in context");
      p.on("download", (d) =>
        log.info({ url: p.url(), filename: d.suggestedFilename() }, "DIAG download event on POPUP"));
      p.on("framenavigated", () => log.info({ url: p.url() }, "DIAG popup navigated"));
      p.on("close", () => log.info("DIAG popup closed"));
    });

    const readDownloadEvent = async (d: PwDownload, via: string): Promise<Download> => {
      const filename = d.suggestedFilename();
      const stream = await d.createReadStream();
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      const buffer = Buffer.concat(chunks);
      log.info({ via, filename, bytes: buffer.length }, "download captured");
      return { buffer, filename };
    };

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

    // (a) A real `download` event on the CURRENT page OR on any popup the trigger
    // opens. The SAT CSF button does window.open(...) and the PDF arrives as an
    // attachment on that NEW tab, so the download event fires on the POPUP, not on
    // `page` — listening only on `page` (the old code) missed it and we timed out
    // while the browser quietly saved the PDF. Hook every existing + future page.
    const viaDownload = new Promise<Download | null>((resolve) => {
      let settled = false;
      const finish = (d: Download | null) => {
        if (settled) return;
        settled = true;
        ctx.off("page", hookPage);
        resolve(d);
      };
      const onDownload = (via: string) => (d: PwDownload) =>
        readDownloadEvent(d, via).then(finish, () => void 0);
      const hookPage = (p: Page) => p.on("download", onDownload("download:popup"));
      page.on("download", onDownload("download:page"));
      ctx.on("page", hookPage);
      setTimeout(() => finish(null), timeoutMs);
    });

    // A popup that renders the PDF INLINE (viewer, no attachment) — fetch its URL
    // with the session cookies. (The attachment case is handled by viaDownload above.)
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
    // DIAG: snapshot the context right after the click + 2s later (lets a popup/nav land).
    log.info({ pages: ctx.pages().map((p) => p.url()) }, "DIAG pages right after trigger");
    void page
      .waitForTimeout(2000)
      .then(() => log.info({ pages: ctx.pages().map((p) => p.url()) }, "DIAG pages 2s after trigger"))
      .catch(() => void 0);
    const result = await firstTruthy([viaDownload, viaPopup(), viaInlineNav()], timeoutMs + 1000);
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
