/**
 * pnpm db:seed
 *
 * Populates the DB with realistic mock data for development.
 * Safe to run multiple times — checks for existing seed data first.
 *
 * Creates:
 *  - 1 test user (dev@sati.test / password: satidev123)
 *  - 1 credential (CIEC, RFC: GAMO840512HDF)
 *  - 12 emitted invoices (documents type=invoice_emitted)
 *  - 8 received invoices  (documents type=invoice_received)
 *  - 1 CSF document       (documents type=csf)
 */

import { db, users, credentials, documents } from "./index.js";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SEED_EMAIL = "dev@sati.test";
const SEED_RFC = "GAMO840512HDF";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

// ── Fake data helpers ─────────────────────────────────────────────────────────

const RFCS = [
  "XAXX010101000", "ROM240313I36", "ABC123456DEF", "XYZ789012GHI",
  "CLT240101SA1", "PROV230515JK2", "SUPL220301LM3", "EMP210715NO4",
];

function makeEmittedInvoice(i: number) {
  const subtotal = Math.round((2000 + i * 1234.56) * 100) / 100;
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  const fechaEmision = new Date(Date.now() - i * 8 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rfcReceptor = RFCS[i % RFCS.length] ?? XAXX;
  return {
    uuid: `E${String(i + 1).padStart(3, "0")}-SEED-${SEED_RFC}`,
    rfcEmisor: SEED_RFC,
    rfcReceptor,
    fechaEmision,
    subtotal,
    iva,
    total,
    estado: "Vigente" as const,
    tipoComprobante: "I" as const,
  };
}

function makeReceivedInvoice(i: number) {
  const subtotal = Math.round((500 + i * 670.33) * 100) / 100;
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;
  const fechaEmision = new Date(Date.now() - i * 10 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rfcEmisor = RFCS[(i + 3) % RFCS.length] ?? XAXX;
  return {
    uuid: `R${String(i + 1).padStart(3, "0")}-SEED-${SEED_RFC}`,
    rfcEmisor,
    rfcReceptor: SEED_RFC,
    fechaEmision,
    subtotal,
    iva,
    total,
    estado: "Vigente" as const,
    tipoComprobante: "I" as const,
  };
}

const MOCK_CSF = {
  rfc: SEED_RFC,
  nombre: "GARCIA MORALES OSCAR",
  regimenFiscal: ["Régimen Simplificado de Confianza"],
  domicilioFiscal: {
    codigoPostal: "06600",
    entidad: "CIUDAD DE MEXICO",
    municipio: "CUAUHTEMOC",
    colonia: "JUAREZ",
  },
  obligaciones: [
    {
      descripcion: "Pago provisional mensual de ISR. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento:
        "A más tardar el día 17 del mes de calendario inmediato posterior a aquél al que corresponda el pago",
    },
    {
      descripcion: "Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento:
        "A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.",
    },
    {
      descripcion:
        "Ajuste anual de ISR correspondiente a la declaración anual. Régimen Simplificado de Confianza.",
      fechaInicio: "01/01/2024",
      vencimiento: "A más tardar el día 30 del mes de abril del ejercicio siguiente",
    },
  ],
  pdfArtifactId: "seed-csf-artifact-id",
};

const XAXX = "XAXX010101000";

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding database…");

  // 1 — User
  const existing = await db().select().from(users).where(eq(users.email, SEED_EMAIL)).limit(1);
  let userId: string;

  if (existing[0]) {
    userId = existing[0].id;
    console.log(`  ✓ User already exists (${SEED_EMAIL})`);
  } else {
    const passwordHash = await hashPassword("satidev123");
    const [user] = await db()
      .insert(users)
      .values({ email: SEED_EMAIL, displayName: "Dev User (seed)", passwordHash })
      .returning();
    userId = user!.id;
    console.log(`  ✓ Created user ${SEED_EMAIL} (password: satidev123)`);
  }

  // 2 — Credential
  const existingCred = await db()
    .select()
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);

  let credentialId: string;
  if (existingCred[0]) {
    credentialId = existingCred[0].id;
    console.log(`  ✓ Credential already exists (RFC: ${existingCred[0].rfc})`);
  } else {
    const [cred] = await db()
      .insert(credentials)
      .values({ userId, rfc: SEED_RFC, kind: "ciec" })
      .returning();
    credentialId = cred!.id;
    console.log(`  ✓ Created credential RFC: ${SEED_RFC}`);
  }

  void credentialId;

  // 3 — Check if documents already seeded
  const existingDocs = await db()
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.userId, userId))
    .limit(1);

  if (existingDocs.length > 0) {
    console.log("  ✓ Documents already seeded — skipping");
    console.log("\n✅ Seed complete (no changes needed)");
    console.log(`\n   Login: ${SEED_EMAIL} / satidev123`);
    process.exit(0);
  }

  // 4 — Emitted invoices
  const emitted = Array.from({ length: 12 }, (_, i) => makeEmittedInvoice(i));
  await db().insert(documents).values(
    emitted.map((inv) => ({
      userId,
      rfc: SEED_RFC,
      type: "invoice_emitted" as const,
      title: `Factura emitida ${inv.uuid}`,
      body: `CFDI emitido por ${inv.rfcEmisor} a ${inv.rfcReceptor} por $${inv.total} MXN el ${inv.fechaEmision}`,
      metadata: inv as Record<string, unknown>,
    })),
  );
  console.log(`  ✓ Inserted 12 emitted invoices`);

  // 5 — Received invoices
  const received = Array.from({ length: 8 }, (_, i) => makeReceivedInvoice(i));
  await db().insert(documents).values(
    received.map((inv) => ({
      userId,
      rfc: SEED_RFC,
      type: "invoice_received" as const,
      title: `Factura recibida ${inv.uuid}`,
      body: `CFDI recibido de ${inv.rfcEmisor} por $${inv.total} MXN el ${inv.fechaEmision}`,
      metadata: inv as Record<string, unknown>,
    })),
  );
  console.log(`  ✓ Inserted 8 received invoices`);

  // 6 — CSF document
  await db().insert(documents).values({
    userId,
    rfc: SEED_RFC,
    type: "csf" as const,
    title: "Constancia de Situación Fiscal",
    body: `CSF de ${MOCK_CSF.nombre} RFC ${MOCK_CSF.rfc} regimen ${MOCK_CSF.regimenFiscal.join(", ")} domicilio ${MOCK_CSF.domicilioFiscal.municipio} ${MOCK_CSF.domicilioFiscal.entidad}`,
    metadata: MOCK_CSF as Record<string, unknown>,
  });
  console.log(`  ✓ Inserted CSF document`);

  console.log("\n✅ Seed complete!");
  console.log(`\n   Login: ${SEED_EMAIL} / satidev123`);
  console.log(`   RFC:   ${SEED_RFC}`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}).finally(() => process.exit(0));
