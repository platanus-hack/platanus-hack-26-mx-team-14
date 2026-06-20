import { childLogger } from "@sat/shared";
import type { Session } from "./types.js";
import { storeArtifact } from "./artifacts.js";

/** In-page expression: list interactive elements as a JSON string (DOM-type-free). */
const FIELDS_EXPR = `JSON.stringify(
  Array.from(document.querySelectorAll('input, button, select, textarea, a[href]')).map(function (e) {
    return {
      tag: e.tagName.toLowerCase(),
      id: e.id || undefined,
      name: e.name || undefined,
      type: e.type || undefined,
      ph: e.placeholder || undefined,
      text: (e.textContent || '').trim().slice(0, 50) || undefined,
    };
  })
)`;

/**
 * On a flow failure, capture the current page so unknown (authenticated) selectors
 * can be fixed without guessing: screenshot + full HTML + interactive-field dump,
 * all written to ARTIFACTS_DIR and logged. Never throws.
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

    const fields = await session.evaluate<string>(FIELDS_EXPR).catch(() => "[]");

    log.warn(
      {
        url: session.url(),
        screenshot: shot?.url,
        html: htmlArt?.url,
        fields: safeParse(fields),
      },
      `📸 page dump on failure (${label}) — fix selectors in sat.ts from these fields`,
    );
  } catch (e) {
    log.warn({ err: (e as Error).message }, "dumpFailure could not capture page");
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s.slice(0, 1000);
  }
}
