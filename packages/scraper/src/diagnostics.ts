import { childLogger } from "@sat/shared";
import type { Session } from "./types.js";
import { storeArtifact } from "./artifacts.js";

/**
 * On a flow failure, capture the current page so unknown (authenticated) selectors
 * can be fixed without guessing: screenshot + full HTML, written to ARTIFACTS_DIR
 * and logged (paths only — the field list lives in the HTML). Never throws.
 */
export async function dumpFailure(
  session: Session,
  correlationId: string,
  label: string,
): Promise<void> {
  const log = childLogger({ correlationId, op: "dump-on-failure" });
  try {
    const png = await session.screenshot().catch(() => Buffer.alloc(0));
    const shot = png.length
      ? await storeArtifact("png", png, { correlationId, label: `fail-${label}` })
      : null;

    const html = await session.evaluate<string>("document.documentElement.outerHTML").catch(() => "");
    const htmlArt = html
      ? await storeArtifact("html", Buffer.from(html, "utf8"), { correlationId, label: `fail-${label}` })
      : null;

    // The full DOM is in the saved HTML artifact — don't flood the logs with the
    // field list; grep the HTML file when you need selectors.
    log.warn(
      {
        url: session.url(),
        screenshot: shot?.url,
        html: htmlArt?.url,
      },
      `📸 page dump on failure (${label}) — abre el HTML/screenshot para depurar`,
    );
  } catch (e) {
    log.warn({ err: (e as Error).message }, "dumpFailure could not capture page");
  }
}
