/**
 * Standalone test: generate an invoice preview via Playwright against the live SAT.
 *
 * Usage:
 *   pnpm --filter @sat/worker exec tsx src/test-generate-invoice.ts <credentialId>
 *
 * The credential must already exist in the DB (seeded / registered via the API).
 */

import { runSkill } from "@sat/scraper";
import { childLogger } from "@sat/shared";
import { loadCredential } from "./credentials.js";

const INPUT = {
  receptor: {
    rfc: "DEMO010101ABC",
    nombreRazonSocial: "EMPRESA DE PRUEBA S.A. DE C.V.",
    codigoPostal: "01000",
    regimenFiscalReceptor: "601",
    usoCFDI: "G03",
  },
  conceptos: [
    {
      descripcion:
        'Laptop DemoBook Pro 14" Procesador Intel Core i7, 16GB RAM / 512GB SSD, Windows 11 Home',
      cantidad: 1,
      valorUnitario: 17241.38,
      objetoImpuesto: "02",
    },
  ],
  moneda: "MXN",
  confirmed: false,
};

async function main() {
  const credentialId = process.argv[2];
  if (!credentialId) {
    console.error("Usage: tsx test-generate-invoice.ts <credentialId>");
    process.exit(1);
  }

  const log = childLogger({ skill: "generateInvoice", test: true });
  log.info({ credentialId, input: INPUT }, "loading credential");

  const credential = await loadCredential(credentialId);
  log.info({ rfc: credential.rfc, kind: credential.kind }, "credential loaded");

  const correlationId = `test-${Date.now()}`;

  log.info("starting generateInvoice flow — this will login to SAT and drive the form");

  try {
    const result = await runSkill({
      skill: "generateInvoice",
      input: INPUT,
      credential,
      correlationId,
      userId: "test-user",
    });

    log.info({ result }, "generateInvoice FINISHED");
    console.log("\n=== RESULT ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    log.error({ err: (err as Error).message, stack: (err as Error).stack }, "generateInvoice FAILED");
    console.error("\n=== ERROR ===");
    console.error((err as Error).message);
    process.exit(1);
  }
}

main();
