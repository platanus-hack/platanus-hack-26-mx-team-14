import { env, logger } from "@sat/shared";
import type { BrowserDriver } from "./types.js";
import { PlaywrightDriver } from "./drivers/playwright.js";
import { FirecrawlDriver } from "./drivers/firecrawl.js";

export type DriverName = "playwright" | "firecrawl";

/**
 * Resolve a requested driver to one we can actually run. Firecrawl needs an API
 * key; without one it silently degrades to Playwright so dev/CI never crash on a
 * missing secret. See docs/08-scraper-decision.md.
 */
export function resolveDriver(choice: DriverName): DriverName {
  if (choice === "firecrawl" && !env.FIRECRAWL_API_KEY) {
    logger.warn("FIRECRAWL_API_KEY not set — degrading firecrawl → playwright");
    return "playwright";
  }
  return choice;
}

/** Build a concrete driver. Pass the resolved name (see `resolveDriver`). */
export function makeDriver(choice: DriverName): BrowserDriver {
  return resolveDriver(choice) === "firecrawl"
    ? new FirecrawlDriver()
    : new PlaywrightDriver();
}
