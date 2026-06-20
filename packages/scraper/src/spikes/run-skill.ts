/**
 * Standalone SAT-client tester — NO DB, NO Redis, NO api/worker.
 * Builds a credential in-memory from env and runs one skill flow directly, so you
 * can verify Brisk Camel against the real SAT. Use HEADED=1 to watch the browser.
 *
 * Usage:
 *   # CIEC (RFC + contraseña + captcha):
 *   ANTHROPIC_API_KEY=sk-ant-... SAT_RFC=XAXX010101000 SAT_PASSWORD='...' \
 *     HEADED=1 pnpm --filter @sat/scraper test:skill getEmitedInvoices
 *
 *   # e.firma (.cer/.key) — runs on Playwright automatically:
 *   ANTHROPIC_API_KEY=sk-ant-... SAT_RFC=... SAT_CER_PATH=./fiel.cer \
 *     SAT_KEY_PATH=./fiel.key SAT_KEY_PASSWORD='...' \
 *     HEADED=1 pnpm --filter @sat/scraper test:skill getEmitedInvoices
 *
 * Optional: SAT_FROM=2026-05-01 SAT_TO=2026-05-31
 * Skills: getEmitedInvoices (default) | getReceiptInvoices | generateCSF
 *         | generateInvoice  (always runs with confirmed=false → only previews)
 */
import { readFileSync } from "node:fs";
import { runSkill } from "../runner.js";
import type { Credential, SkillName } from "@sat/events";

function credentialFromEnv(): Credential {
  const rfc = process.env.SAT_RFC;
  if (!rfc) throw new Error("SAT_RFC is required");

  if (process.env.SAT_CER_PATH) {
    const keyPath = process.env.SAT_KEY_PATH;
    const keyPassword = process.env.SAT_KEY_PASSWORD;
    if (!keyPath || !keyPassword) {
      throw new Error("e.firma needs SAT_KEY_PATH and SAT_KEY_PASSWORD");
    }
    return {
      kind: "efirma",
      rfc,
      cer: readFileSync(process.env.SAT_CER_PATH),
      key: readFileSync(keyPath),
      keyPassword,
    };
  }

  const password = process.env.SAT_PASSWORD;
  if (!password) throw new Error("CIEC needs SAT_PASSWORD (or use SAT_CER_PATH for e.firma)");
  return { kind: "ciec", rfc, password };
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from: process.env.SAT_FROM ?? from, to: process.env.SAT_TO ?? to };
}

async function main() {
  const skill = (process.argv[2] ?? "getEmitedInvoices") as SkillName;
  const credential = credentialFromEnv();

  const input: Record<string, unknown> =
    skill === "generateCSF"
      ? {}
      : skill === "generateInvoice"
        ? {
            // Preview-only smoke test (confirmed=false → never emits).
            // Receptor = público en general (XAXX010101000) so it resolves via
            // "Cliente Frecuente"; régimen 616 / uso S01 is the público-general combo.
            receptor: {
              rfc: process.env.SAT_RECEPTOR_RFC ?? "XAXX010101000",
              nombreRazonSocial: "PUBLICO EN GENERAL",
              codigoPostal: process.env.SAT_RECEPTOR_CP ?? "11800",
              regimenFiscalReceptor: "616",
              usoCFDI: "S01",
            },
            // claveProdServ + claveUnidad are mandatory to save a concepto.
            conceptos: [
              {
                claveProdServ: "01010101",
                descripcion: "Prueba",
                claveUnidad: "H87",
                cantidad: 1,
                valorUnitario: 100,
              },
            ],
            confirmed: false,
          }
        : defaultRange();

  console.log(`\n▶ Running ${skill} for ${credential.rfc} (${credential.kind})`);
  console.log(`  driver=${process.env.SAT_DRIVER ?? "playwright"} headed=${process.env.HEADED ?? "0"}\n`);

  const result = await runSkill({
    skill,
    input,
    credential,
    correlationId: `test-${Date.now()}`,
    userId: "test-user",
    emit: (a) => console.log(`  · [${a.kind}] ${a.label} (${a.status})${a.liveViewUrl ? ` → ${a.liveViewUrl}` : ""}`),
  });

  console.log("\n✅ Result:\n", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err?.message ?? err);
  if (err?.meta) console.error("   meta:", err.meta);
  process.exit(1);
});
