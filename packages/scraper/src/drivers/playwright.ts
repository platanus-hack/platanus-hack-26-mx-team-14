import type { Browser, BrowserContext, Page } from "playwright";
import { uuid } from "@sat/shared";
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

class PlaywrightSession implements Session {
  constructor(
    readonly id: string,
    private context: BrowserContext,
    private page: Page,
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
  async type(selector: string, value: string): Promise<void> {
    await this.page.type(selector, value);
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
    const [download] = await Promise.all([
      this.page.waitForEvent("download", { timeout: timeoutMs }),
      trigger(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return { buffer: Buffer.concat(chunks), filename: download.suggestedFilename() };
  }
  async evaluate<T>(expression: string): Promise<T> {
    return this.page.evaluate(expression) as Promise<T>;
  }
  async liveViewUrl(): Promise<string | null> {
    return null; // Playwright is local — no hosted live view.
  }
  async close(): Promise<void> {
    await this.context.close();
  }
}
