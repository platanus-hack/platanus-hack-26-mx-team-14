/**
 * SPIKE — verify whether Firecrawl /interact can capture a PDF download.
 * Resolves open item #1 in docs/08-scraper-decision.md. Run:
 *   pnpm --filter @sat/scraper spike:pdf
 *
 * Strategy: open a known PDF-producing page, try two capture paths, report which
 * works. If neither does, CSF/generateInvoice stay on PlaywrightDriver.
 */
import { FirecrawlDriver } from "../drivers/firecrawl.js";

const TEST_PDF_TRIGGER_URL =
  process.env.SPIKE_URL ?? "https://www.orimi.com/pdf-test.pdf"; // replace with a click-to-download page

async function main() {
  const driver = new FirecrawlDriver();
  const session = await driver.createSession({ rfc: "TEST", correlationId: "spike" });
  try {
    await session.goto(TEST_PDF_TRIGGER_URL);

    // Path A: page.on('download') inside interact code-exec.
    try {
      const dl = await session.captureDownload(async () => {
        /* clicking a download link would go here */
      });
      console.log("Path A (download event) OK:", dl.filename, dl.buffer.length, "bytes");
      return;
    } catch (e) {
      console.warn("Path A failed:", (e as Error).message);
    }

    // Path B: fetch the PDF URL with session cookies via evaluate().
    try {
      const b64 = await session.evaluate<string>(
        `(async () => { const r = await fetch(location.href); const b = await r.arrayBuffer(); return btoa(String.fromCharCode(...new Uint8Array(b))); })()`,
      );
      console.log("Path B (cookie fetch) OK:", Buffer.from(b64, "base64").length, "bytes");
    } catch (e) {
      console.warn("Path B failed:", (e as Error).message);
      console.error("Neither path works → keep CSF/generateInvoice on PlaywrightDriver.");
    }
  } finally {
    await session.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
