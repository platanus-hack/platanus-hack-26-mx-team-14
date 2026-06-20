/**
 * Selector discovery tool. Opens a SAT login page (headed) and dumps EVERY
 * input/button/select/form/iframe with its real attributes — including inside
 * iframes — plus a screenshot + full HTML. Use the output to fix sat.ts.
 *
 * Usage:
 *   pnpm --filter @sat/scraper diagnose ciec      # CIEC login (facturas)
 *   pnpm --filter @sat/scraper diagnose factura    # CIEC login (genera factura)
 *   pnpm --filter @sat/scraper diagnose portal     # Portal SAT login (CSF)
 *   pnpm --filter @sat/scraper diagnose https://...# any URL
 *
 * Always headed + paused so you can inspect; press Ctrl-C when done.
 */
import { chromium, type Frame } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SAT_URLS } from "../sat.js";

const TARGETS: Record<string, string> = {
  ciec: SAT_URLS.cfdiLoginEmitidas, // deep federation URL (often blank if hit directly)
  cfdi: SAT_URLS.portalCfdi, // human entry → redirects to the real CIEC login form
  factura: SAT_URLS.cfdiLoginFactura,
  portal: SAT_URLS.portalLogin,
};

type Field = {
  tag: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  text?: string;
  visible?: boolean;
};

async function dumpFrame(frame: Frame): Promise<Field[]> {
  // DOM-type-free body (scraper tsconfig has no `dom` lib) — runs in page context.
  return frame
    .evaluate(() => {
      const doc = (globalThis as { document?: unknown }).document as {
        querySelectorAll: (s: string) => ArrayLike<Record<string, unknown> & { getBoundingClientRect: () => { width: number; height: number }; tagName: string; textContent: string | null }>;
      };
      const els = Array.from(doc.querySelectorAll("input, button, select, textarea, a[href]"));
      return els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          tag: String(e.tagName).toLowerCase(),
          id: (e.id as string) || undefined,
          name: (e.name as string) || undefined,
          type: (e.type as string) || undefined,
          placeholder: (e.placeholder as string) || undefined,
          text: (e.textContent || "").trim().slice(0, 50) || undefined,
          visible: r.width > 0 && r.height > 0,
        };
      });
    })
    .catch(() => []) as Promise<Field[]>;
}

function printFields(label: string, fields: Field[]) {
  const interesting = fields.filter(
    (f) => f.id || f.name || f.placeholder || (f.tag !== "a" && f.text),
  );
  console.log(`\n── ${label} (${interesting.length} elements) ──`);
  for (const f of interesting) {
    const sel = f.id ? `#${f.id}` : f.name ? `[name="${f.name}"]` : `(no id/name)`;
    const v = f.visible ? "" : " [hidden]";
    console.log(
      `  ${f.tag.padEnd(8)} ${sel.padEnd(34)} type=${f.type ?? "-"} ` +
        `ph=${f.placeholder ?? "-"} text="${f.text ?? ""}"${v}`,
    );
  }
}

async function main() {
  const arg = process.argv[2] ?? "ciec";
  const url = arg.startsWith("http") ? arg : TARGETS[arg];
  if (!url) throw new Error(`Unknown target "${arg}". Use: ciec | factura | portal | <url>`);

  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const ctx = await browser.newContext({ locale: "es-MX" });
  const page = await ctx.newPage();

  console.log(`\n▶ Opening ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => console.warn("goto:", e.message));
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => void 0);

  console.log(`\n📍 Final URL (after redirects): ${page.url()}`);
  console.log(`📄 Title: ${await page.title().catch(() => "?")}`);
  console.log(`🪟 Frames: ${page.frames().length}`);

  // Images (captcha lives in an <img>) — main frame only.
  const imgs = (await page
    .mainFrame()
    .evaluate(() => {
      const doc = (globalThis as { document?: unknown }).document as {
        querySelectorAll: (s: string) => ArrayLike<Record<string, unknown>>;
      };
      return Array.from(doc.querySelectorAll("img")).map((i) => ({
        id: (i.id as string) || undefined,
        src: String(i.src ?? "").slice(0, 90),
        alt: (i.alt as string) || undefined,
        w: i.width,
        h: i.height,
      }));
    })
    .catch(() => [])) as Array<{ id?: string; src: string; alt?: string; w: number; h: number }>;
  if (imgs.length) {
    console.log(`\n── images (${imgs.length}) ──`);
    for (const i of imgs) {
      console.log(`  ${i.id ? "#" + i.id : "(no id)"} ${i.w}x${i.h} alt="${i.alt ?? ""}" src=${i.src}`);
    }
  }

  // Main document + every iframe (SAT often nests the form / captcha in a frame).
  printFields("main document", await dumpFrame(page.mainFrame()));
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    printFields(`iframe ${frame.url()}`, await dumpFrame(frame));
  }

  // Save artifacts for inspection.
  const dir = resolve(process.env.ARTIFACTS_DIR ?? "./artifacts-local", "diagnose");
  mkdirSync(dir, { recursive: true });
  const stamp = `${arg}-${Date.now()}`;
  await page.screenshot({ path: resolve(dir, `${stamp}.png`), fullPage: true }).catch(() => void 0);
  writeFileSync(resolve(dir, `${stamp}.html`), await page.content().catch(() => ""));
  console.log(`\n💾 Saved screenshot + HTML to ${dir}/${stamp}.{png,html}`);

  console.log("\n⏸  Browser stays open. Inspect the fields, then press Ctrl-C.\n");
  await new Promise(() => {}); // keep open until Ctrl-C
}

main().catch((err) => {
  console.error("\n❌", err?.message ?? err);
  process.exit(1);
});
