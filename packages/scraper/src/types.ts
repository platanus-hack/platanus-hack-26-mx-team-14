/**
 * BrowserDriver abstraction — flows are written against `Session`, never a
 * concrete backend. Implementations: PlaywrightDriver (local/prod),
 * FirecrawlDriver (/interact, managed). See docs/08-scraper-decision.md.
 */

export type UploadFile = { name: string; buffer: Buffer; mimeType: string };
export type Download = { buffer: Buffer; filename: string };

export interface WaitOpts {
  timeoutMs?: number;
  state?: "attached" | "visible" | "hidden";
}

export interface ClickOpts {
  timeoutMs?: number;
  /** Bypass actionability checks (visibility/stability/pointer-events). Last-resort. */
  force?: boolean;
}

export interface Session {
  /** Stable id (Firecrawl scrapeId / Playwright context id). */
  readonly id: string;

  goto(url: string): Promise<void>;
  url(): string;

  click(selector: string, opts?: ClickOpts): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  /** Types char-by-char (fires real key events). `delayMs` adds a human pause per key. */
  type(selector: string, value: string, opts?: { delayMs?: number }): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  setInputFiles(selector: string, files: UploadFile[]): Promise<void>;

  waitFor(selector: string, opts?: WaitOpts): Promise<void>;
  waitForLoad(): Promise<void>;
  waitForHidden(selector: string, opts?: WaitOpts): Promise<void>;

  innerText(selector: string): Promise<string>;
  getAttribute(selector: string, attr: string): Promise<string | null>;
  /** Runtime `.value` of an <input>/<select> (works with Playwright `:visible`, unlike evaluate). */
  inputValue(selector: string): Promise<string>;
  /** True only if visible AND enabled AND editable (false for disabled/readonly/hidden). */
  isEditable(selector: string): Promise<boolean>;
  exists(selector: string): Promise<boolean>;

  /** Screenshot of the page or a single element (used to feed captchas to Claude). */
  screenshot(selector?: string, opts?: { fullPage?: boolean }): Promise<Buffer>;

  /** Run `trigger`, capture the file download it produces (PDF/XML). */
  captureDownload(trigger: () => Promise<void>, timeoutMs?: number): Promise<Download>;

  /** Arbitrary JS in page context. */
  evaluate<T>(expression: string): Promise<T>;

  /** Firecrawl: interactive live-view URL for human captcha/2FA takeover. */
  liveViewUrl(): Promise<string | null>;

  close(): Promise<void>;
}

export interface BrowserDriver {
  readonly name: "playwright" | "firecrawl";
  /** Create a fresh, stateful session for an RFC (cookies persist across calls). */
  createSession(opts: { rfc: string; correlationId: string }): Promise<Session>;
}
