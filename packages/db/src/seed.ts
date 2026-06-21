/**
 * pnpm db:seed
 *
 * Seeds documents for every user that already has credentials but no documents.
 * Each user gets realistic invoice + CSF data keyed to their real RFC.
 * Safe to run multiple times — skips users that already have documents.
 *
 * If no users exist at all, creates one dev user first.
 */

import { db, users, credentials, documents } from "./index.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { scrypt, randomBytes, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// ── Deterministic pseudo-random from a seed string ────────────────────────────

/** Simple LCG seeded from a string hash — gives stable values per RFC. */
function makeRng(seed: string) {
  let state = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return {
    next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    int(min: number, max: number) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick<T>(arr: T[]): T {
      return arr[this.int(0, arr.length - 1)]!;
    },
  };
}

// ── Realistic counterparty pools ──────────────────────────────────────────────

const CLIENTS = [
  { rfc: "ACO050101AB1", nombre: "ACME Consultoría SA de CV" },
  { rfc: "DIG180920QX3", nombre: "Digital House MX SA de CV" },
  { rfc: "TEC110704RM8", nombre: "Tecnológicas Norte SA de CV" },
  { rfc: "SOF200315GH7", nombre: "Software Factory México SA de CV" },
  { rfc: "INN160802KP9", nombre: "Innova Sistemas SA de CV" },
  { rfc: "GLO140215TY2", nombre: "Global Tech MX SA de CV" },
  { rfc: "PRO190511NM4", nombre: "Prodigital México SA de CV" },
  { rfc: "DMS180521KL2", nombre: "DiDi Mobility México" },
  { rfc: "UBE140317AB5", nombre: "Uber México (Plataforma)" },
  { rfc: "RAP190812CD7", nombre: "Rappi México (Plataforma)" },
];

const SUPPLIERS = [
  { rfc: "TEL840315KT6", nombre: "Teléfonos de México (Internet)" },
  { rfc: "ADO150601XY1", nombre: "Adobe Systems (Software)" },
  { rfc: "PEM920101AAA", nombre: "Pemex (Combustible)" },
  { rfc: "AMZ140210ZZ2", nombre: "Amazon Web Services (Hosting)" },
  { rfc: "COW180505QW3", nombre: "WeWork (Coworking)" },
  { rfc: "OFF160708RT4", nombre: "Office Depot (Papelería)" },
  { rfc: "ROM240313I36", nombre: "Roma Servicios Digitales" },
  { rfc: "MIC150901ZA8", nombre: "Microsoft México (Licencias)" },
  { rfc: "GOO170220BC3", nombre: "Google México (Servicios Cloud)" },
  { rfc: "CLR200410QR5", nombre: "Claro México (Telefonía)" },
];

const REGIMENES = [
  "Régimen Simplificado de Confianza",
  "Régimen de Actividades Empresariales y Profesionales",
  "Régimen de las Actividades Empresariales a través de Plataformas Tecnológicas",
  "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios",
];

const MUNICIPIOS = [
  { municipio: "MIGUEL HIDALGO", colonia: "POLANCO V SECCION", cp: "11560", entidad: "CIUDAD DE MEXICO" },
  { municipio: "CUAUHTEMOC", colonia: "JUAREZ", cp: "06600", entidad: "CIUDAD DE MEXICO" },
  { municipio: "BENITO JUAREZ", colonia: "DEL VALLE", cp: "03100", entidad: "CIUDAD DE MEXICO" },
  { municipio: "ALVARO OBREGON", colonia: "SANTA FE", cp: "01376", entidad: "CIUDAD DE MEXICO" },
  { municipio: "MONTERREY", colonia: "SAN PEDRO GARZA GARCIA", cp: "66220", entidad: "NUEVO LEON" },
  { municipio: "GUADALAJARA", colonia: "ZAPOPAN", cp: "45116", entidad: "JALISCO" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Generate a UUID-like folio deterministic from a seed number + prefix. */
function makeUUID(prefix: string, n: number): string {
  const h = ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").toUpperCase();
  const p = createHash("md5").update(prefix).digest("hex").slice(0, 4).toUpperCase();
  return `${h}-${p}-4${String(n).padStart(3, "0")}-B255-5835C7${String(n).padStart(6, "0")}`;
}

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function quarter(month: number) {
  return `Q${Math.ceil((month + 1) / 3)}`;
}

/** Return an ISO date string (YYYY-MM-DD) for a specific year/month, random day within the month. */
function dateInMonth(year: number, month: number, day: number): string {
  const maxDay = new Date(year, month + 1, 0).getDate();
  const d = Math.min(day, maxDay);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Monthly seasonality multipliers (January=0 … December=11).
// Simulates a freelancer/SME that earns more Q2 and Q4.
const SEASON = [0.7, 0.75, 0.9, 1.1, 1.2, 1.15, 0.85, 0.8, 0.95, 1.1, 1.25, 1.3];

// ── Document builders ─────────────────────────────────────────────────────────

/**
 * 18 months of emitted invoices, 3-6 per month, structured for historical NLP.
 * Body text embeds month name + quarter + year so semantic search finds them.
 */
function buildEmittedInvoices(userId: string, rfc: string, rng: ReturnType<typeof makeRng>) {
  const results = [];
  const now = new Date();
  let seq = 1000;

  for (let monthsBack = 17; monthsBack >= 0; monthsBack--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = MONTH_NAMES_ES[month]!;
    const q = quarter(month);
    const season = SEASON[month]!;

    const countThisMonth = rng.int(1, 3);
    for (let j = 0; j < countThisMonth; j++) {
      const client = rng.pick(CLIENTS);
      const base = rng.int(4, 14) * 1000;
      const subtotal = round2(base * season);
      const iva = round2(subtotal * 0.16);
      const total = round2(subtotal + iva);
      const estado = rng.next() > 0.92 ? "Cancelado" : "Vigente";
      const day = rng.int(1, 28);
      const fecha = dateInMonth(year, month, day);
      const uuid = makeUUID(`emit-${rfc}`, seq++);

      const inv = {
        uuid,
        rfcEmisor: rfc,
        rfcReceptor: client.rfc,
        nombreReceptor: client.nombre,
        fechaEmision: fecha,
        subtotal,
        iva,
        total,
        estado,
        tipoComprobante: "I",
      };

      results.push({
        userId,
        rfc,
        type: "invoice_emitted" as const,
        naturalKey: uuid,
        title: `Factura emitida a ${client.nombre} — ${monthName} ${year}`,
        body:
          `Factura emitida UUID ${uuid} de ${rfc} a ${client.rfc} (${client.nombre}) ` +
          `por $${total.toLocaleString("es-MX")} MXN el ${fecha} ` +
          `(${monthName} de ${year}, ${q} ${year}). Estado: ${estado}.`,
        metadata: inv as Record<string, unknown>,
      });
    }
  }
  return results;
}

/**
 * 18 months of received invoices, 2-4 per month, same temporal structure.
 */
function buildReceivedInvoices(userId: string, rfc: string, rng: ReturnType<typeof makeRng>) {
  const results = [];
  const now = new Date();
  let seq = 2000;

  for (let monthsBack = 17; monthsBack >= 0; monthsBack--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = MONTH_NAMES_ES[month]!;
    const q = quarter(month);

    const countThisMonth = rng.int(1, 3);
    for (let j = 0; j < countThisMonth; j++) {
      const supplier = rng.pick(SUPPLIERS);
      const subtotal = round2(rng.int(3, 28) * 100 + rng.next() * 100);
      const iva = round2(subtotal * 0.16);
      const total = round2(subtotal + iva);
      const day = rng.int(1, 28);
      const fecha = dateInMonth(year, month, day);
      const uuid = makeUUID(`recv-${rfc}`, seq++);

      const inv = {
        uuid,
        rfcEmisor: supplier.rfc,
        nombreEmisor: supplier.nombre,
        rfcReceptor: rfc,
        fechaEmision: fecha,
        subtotal,
        iva,
        total,
        estado: "Vigente",
        tipoComprobante: "I",
      };

      results.push({
        userId,
        rfc,
        type: "invoice_received" as const,
        naturalKey: uuid,
        title: `Factura recibida de ${supplier.nombre} — ${monthName} ${year}`,
        body:
          `Factura recibida UUID ${uuid} de ${supplier.rfc} (${supplier.nombre}) a ${rfc} ` +
          `por $${total.toLocaleString("es-MX")} MXN el ${fecha} ` +
          `(${monthName} de ${year}, ${q} ${year}).`,
        metadata: inv as Record<string, unknown>,
      });
    }
  }
  return results;
}

function buildCSF(userId: string, rfc: string, nombre: string, rng: ReturnType<typeof makeRng>) {
  const dom = rng.pick(MUNICIPIOS);
  const numRegimenes = rng.int(1, 3);
  const shuffledReg = [...REGIMENES].sort(() => rng.next() - 0.5).slice(0, numRegimenes);

  const csf = {
    rfc,
    nombre: nombre.toUpperCase(),
    regimenFiscal: shuffledReg,
    domicilioFiscal: {
      codigoPostal: dom.cp,
      entidad: dom.entidad,
      municipio: dom.municipio,
      colonia: dom.colonia,
    },
    obligaciones: [
      {
        descripcion: "Pago provisional mensual de ISR. Régimen Simplificado de Confianza.",
        fechaInicio: "01/01/2025",
        vencimiento: "A más tardar el día 17 del mes de calendario inmediato posterior.",
      },
      {
        descripcion: "Pago definitivo mensual de IVA. Régimen Simplificado de Confianza.",
        fechaInicio: "01/01/2025",
        vencimiento: "A más tardar el día 17 del mes inmediato posterior al periodo.",
      },
      {
        descripcion: "Ajuste anual de ISR correspondiente a la declaración anual.",
        fechaInicio: "01/01/2025",
        vencimiento: "A más tardar el día 30 del mes de abril del ejercicio siguiente.",
      },
    ],
    pdfArtifactId: `seed-csf-${rfc.toLowerCase()}`,
  };

  return {
    userId,
    rfc,
    type: "csf" as const,
    naturalKey: `csf:${rfc}`,
    title: "Constancia de Situación Fiscal",
    body: `CSF de ${csf.nombre} RFC ${rfc}. Régimen(es): ${shuffledReg.join(", ")}. Domicilio: ${dom.colonia}, ${dom.municipio}, ${dom.entidad}. CP ${dom.cp}.`,
    metadata: csf as Record<string, unknown>,
  };
}

// ── Dev user fallback ─────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

async function ensureDevUser(): Promise<{ userId: string; rfc: string; nombre: string }> {
  const DEV_EMAIL = "dev@sati.test";
  const DEV_RFC = "RAOA0111176P7";
  const DEV_NAME = "ANDRICK DANIEL RAMOS ORTEGA";

  const existing = await db().select().from(users).where(eq(users.email, DEV_EMAIL)).limit(1);
  let userId: string;

  if (existing[0]) {
    userId = existing[0].id;
    console.log(`  ✓ Dev user already exists (${DEV_EMAIL})`);
  } else {
    const passwordHash = await hashPassword("satidev123");
    const [user] = await db()
      .insert(users)
      .values({ email: DEV_EMAIL, displayName: DEV_NAME, passwordHash })
      .returning();
    userId = user!.id;
    console.log(`  ✓ Created dev user ${DEV_EMAIL} (password: satidev123)`);
  }

  const existingCred = await db()
    .select()
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);

  if (!existingCred[0]) {
    await db().insert(credentials).values({ userId, rfc: DEV_RFC, kind: "ciec" });
    console.log(`  ✓ Created credential RFC: ${DEV_RFC}`);
  }

  return { userId, rfc: DEV_RFC, nombre: DEV_NAME };
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Flags:
//   --force   Wipe existing invoice rows and re-seed them. CSF rows are preserved.
//   --csf     Also seed a CSF if none exists for this user.

async function seed() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const seedCsf = args.includes("--csf");

  console.log(`Seeding invoices${seedCsf ? " + CSF" : ""} for all users with credentials…`);
  if (force) console.log("  --force: existing invoice rows will be replaced\n");

  const allRows = await db()
    .select({ userId: users.id, rfc: credentials.rfc, nombre: users.displayName })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id));

  // Deduplicate by (userId, rfc) — multiple credentials for the same user/RFC must not double-seed.
  const seen = new Set<string>();
  const rows = allRows.filter(r => {
    const key = `${r.userId}:${r.rfc}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (rows.length === 0) {
    console.log("  No users with credentials — creating dev user…");
    const dev = await ensureDevUser();
    rows.push(dev);
  }

  console.log(`  Found ${rows.length} user(s).\n`);

  const INVOICE_TYPES = ["invoice_emitted", "invoice_received", "invoice_issued"] as const;

  let seeded = 0;
  let skipped = 0;

  for (const { userId, rfc, nombre } of rows) {
    const displayName = nombre ?? rfc;
    const rng = makeRng(rfc);

    // Check for ANY invoice rows (including soft-deleted) to detect if this user was seeded.
    const existingInvoices = await db()
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, userId), inArray(documents.type, [...INVOICE_TYPES])))
      .limit(1);

    if (existingInvoices.length > 0 && !force) {
      console.log(`  ⏭  ${rfc} (${displayName}) — facturas ya existen (usa --force para resembrar)`);
      skipped++;
      continue;
    }

    if (force) {
      // Hard-delete ALL invoice rows (including soft-deleted) so naturalKeys are freed.
      await db()
        .delete(documents)
        .where(and(eq(documents.userId, userId), inArray(documents.type, [...INVOICE_TYPES])));
      if (existingInvoices.length > 0) console.log(`  ↺  ${rfc} — facturas anteriores eliminadas`);
    }

    const emitted = buildEmittedInvoices(userId, rfc, rng);
    const received = buildReceivedInvoices(userId, rfc, rng);

    let csfNote = "";
    if (seedCsf) {
      const hasCsf = await db()
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.userId, userId), eq(documents.type, "csf"), isNull(documents.deletedAt)))
        .limit(1);
      if (hasCsf.length === 0) {
        await db().insert(documents).values([buildCSF(userId, rfc, displayName, rng)]);
        csfNote = ", CSF";
      }
    }

    await db().insert(documents).values([...emitted, ...received]);
    console.log(`  ✓  ${rfc} (${displayName}) — ${emitted.length} emitidas, ${received.length} recibidas${csfNote}`);
    seeded++;
  }

  console.log(`\nDone — ${seeded} resembradas, ${skipped} sin cambios.`);
}

seed()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
