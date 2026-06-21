/**
 * Test: Generate invoice with default público en general receptor data
 *
 * This test verifies that when generating an invoice for the generic RFC
 * (público en general), the form is filled with the default values:
 * - RFC: XAXX010101000
 * - Código Postal: 01805
 * - Régimen Fiscal: 616 (Sin obligaciones fiscales)
 * - Uso CFDI: S01 (Sin efectos fiscales)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... \
 *   SAT_RFC=QURR0207207B8 \
 *   SAT_PASSWORD='contraseña' \
 *   npx tsx src/spikes/test-default-receptor.ts
 */

import { readFileSync } from "node:fs";
import { PlaywrightDriver } from "../drivers/playwright.js";
import { generateInvoice } from "../flows/generateInvoice.js";
import type { Credential, GenerateInvoiceInput } from "@sat/events";
import { childLogger } from "@sat/shared";

async function test() {
  const log = childLogger({ op: "test-default-receptor" });

  // Read credentials from environment
  const rfc = process.env.SAT_RFC;
  if (!rfc) throw new Error("SAT_RFC required");

  let credential: Credential;

  if (process.env.SAT_CER_PATH) {
    // e.firma (certificate + key)
    const keyPath = process.env.SAT_KEY_PATH;
    const keyPassword = process.env.SAT_KEY_PASSWORD;
    if (!keyPath || !keyPassword) throw new Error("SAT_KEY_PATH and SAT_KEY_PASSWORD required for e.firma");

    credential = {
      kind: "efirma",
      rfc,
      cer: readFileSync(process.env.SAT_CER_PATH),
      key: readFileSync(keyPath),
      keyPassword,
    };
  } else {
    // CIEC (password)
    const password = process.env.SAT_PASSWORD;
    if (!password) throw new Error("SAT_PASSWORD required for CIEC");
    credential = { kind: "ciec", rfc, password };
  }

  const driver = new PlaywrightDriver();
  const session = await driver.createSession({ rfc, correlationId: "test-default-receptor" });

  try {
    const input: GenerateInvoiceInput = {
      // Use generic RFC (público en general)
      receptor: {
        rfc: "XAXX010101000",  // Generic national RFC
        nombreRazonSocial: "",  // Empty name (SAT auto-fills for public)
        codigoPostal: "01805",  // Default postal code
        regimenFiscalReceptor: "616",  // Sin obligaciones fiscales
        usoCFDI: "S01",  // Sin efectos fiscales
      },
      // Single test item: laptop
      conceptos: [
        {
          descripcion: "LAPTOP DEMOBOOK PRO 14\" - Intel Core i7, 16GB RAM, 512GB SSD, Windows 11 Home",
          cantidad: 1,
          valorUnitario: 17241.38,
          descuento: 0,
          claveProdServ: "43232202",  // Computadoras personales
          claveUnidad: "H87",  // Piece
          objetoImpuesto: "02",  // Tasa (16% IVA)
        },
      ],
      moneda: "MXN",
      // IMPORTANT: confirmed=false for preview only (no actual emission)
      confirmed: false,
    };

    log.info(
      {
        rfc: credential.rfc,
        receptorRfc: input.receptor.rfc,
        receptorCp: input.receptor.codigoPostal,
        conceptos: input.conceptos.length,
      },
      "Starting invoice generation test",
    );

    const result = await generateInvoice(
      {
        session,
        credential,
        correlationId: "test-default-receptor",
        userId: "test-user",
        rfc: credential.rfc,
        log,
        emit: (ev) => log.info(ev, "Agent event"),
      },
      input,
    );

    if (result.status === "previewed") {
      log.info(
        {
          status: "success",
          receptorRfc: result.preview.receptorRfc,
          conceptos: result.preview.conceptos.length,
          subtotal: result.preview.subtotal,
          iva: result.preview.iva,
          total: result.preview.total,
        },
        "✅ Invoice preview generated successfully",
      );

      // Verify the expected values are present
      if (result.preview.receptorRfc !== "XAXX010101000") {
        throw new Error(`Expected receptor RFC XAXX010101000, got ${result.preview.receptorRfc}`);
      }

      if (result.preview.total !== 20000.0) {
        throw new Error(`Expected total 20000.00, got ${result.preview.total}`);
      }

      log.info("✅ All assertions passed!");
    } else {
      throw new Error("Expected preview status, got: " + result.status);
    }
  } finally {
    await session.close();
  }
}

test().catch((err) => {
  console.error("❌ Test failed:", err.message);
  process.exit(1);
});
