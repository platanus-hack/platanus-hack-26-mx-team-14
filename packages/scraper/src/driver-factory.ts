import { env } from "@sat/shared";
import type { BrowserDriver } from "./types.js";
import { PlaywrightDriver } from "./drivers/playwright.js";
import { FirecrawlDriver } from "./drivers/firecrawl.js";

/**
 * Returns the configured driver. Some flows can force a specific backend (e.g.
 * e.firma → Playwright, since uploading .cer/.key into Firecrawl is an open item).
 */
export function makeDriver(force?: "playwright" | "firecrawl"): BrowserDriver {
  const choice = force ?? env.SAT_DRIVER;
  return choice === "firecrawl" ? new FirecrawlDriver() : new PlaywrightDriver();
}
