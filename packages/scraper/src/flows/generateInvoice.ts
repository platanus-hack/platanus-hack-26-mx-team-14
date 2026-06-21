import type { GenerateInvoiceInput, InvoicePreview, IssuedInvoice } from "@sat/events";
import { ValidationError } from "@sat/shared";
import type { Session } from "../types.js";
import { login } from "../auth.js";
import { SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { extractInvoiceFromPdf } from "../invoice-extract.js";
import { type FlowContext, step } from "./context.js";

/** RFC genérico nacional (público en general) and extranjero. */
const RFC_GENERICO_NACIONAL = "XAXX010101000";
const RFC_GENERICO_EXTRANJERO = "XEXX010101000";

/**
 * Dismiss any Bootstrap error modal that might be blocking pointer events.
 * The SAT portal sometimes shows #modal-error with data-backdrop="static"
 * which intercepts clicks on underlying buttons. We force-close it and any
 * related backdrops, even if it doesn't exist (best-effort, never throws).
 */
async function dismissErrorModals(session: Session): Promise<void> {
  await session
    .evaluate(
      `(() => {
        // Find all visible error modals (they can appear after the call)
        const modals = document.querySelectorAll(
          '#modal-error, #modal-error.in, .modal.error, .modal.error.in'
        );
        let dismissed = false;
        modals.forEach(m => {
          // Remove any .in class (Bootstrap "in" = visible)
          m.classList.remove('in');
          // Hide the element itself
          m.style.display = 'none';
          m.style.visibility = 'hidden';
          m.setAttribute('aria-hidden', 'true');
          // Remove pointer-events so it can't intercept clicks even if visible
          m.style.pointerEvents = 'none';
          dismissed = true;
        });
        // Clean up all modal backdrops (prevent overflow: hidden lock)
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        return dismissed;
      })()`,
    )
    .catch(() => {});
}

/**
 * Click a selector, retrying once if it fails (likely due to error modal blocking).
 * Dismisses modals on retry — usually clears the blocker.
 */
async function clickWithErrorDismiss(session: Session, selector: string): Promise<void> {
  try {
    await session.click(selector);
  } catch (err) {
    // Check if it's a "intercepts pointer events" timeout (modal blocking).
    if ((err as Error).message?.includes("intercepts pointer events")) {
      await dismissErrorModals(session);
      await session.click(selector); // Retry; let it fail if modal is still there
    } else {
      throw err;
    }
  }
}

/**
 * c_UsoCFDI (CFDI 4.0). The "Uso de la Factura" control is a LOCAL autocomplete
 * (no server URL) that filters its options by the *description*, not the code — so
 * we type the description to select a Uso. Map the code → description here.
 */
const USO_CFDI_DESCRIPCION: Record<string, string> = {
  G01: "Adquisición de mercancías",
  G02: "Devoluciones, descuentos o bonificaciones",
  G03: "Gastos en general",
  I01: "Construcciones",
  I02: "Mobiliario y equipo de oficina por inversiones",
  I03: "Equipo de transporte",
  I04: "Equipo de cómputo y accesorios",
  I05: "Dados, troqueles, moldes, matrices y herramental",
  I06: "Comunicaciones telefónicas",
  I07: "Comunicaciones satelitales",
  I08: "Otra maquinaria y equipo",
  D01: "Honorarios médicos, dentales y gastos hospitalarios",
  D02: "Gastos médicos por incapacidad o discapacidad",
  D03: "Gastos funerales",
  D04: "Donativos",
  D05: "Intereses reales efectivamente pagados por créditos hipotecarios",
  D06: "Aportaciones voluntarias al SAR",
  D07: "Primas por seguros de gastos médicos",
  D08: "Gastos de transportación escolar obligatoria",
  D09: "Depósitos en cuentas para el ahorro",
  D10: "Pagos por servicios educativos",
  S01: "Sin efectos fiscales",
  CP01: "Pagos",
  CN01: "Nómina",
};

/**
 * CFDI 4.0 input safeguards — fail fast with a clear message BEFORE driving the
 * SAT, so prod surfaces an actionable error instead of a cryptic portal modal
 * (and we never waste a captcha/session on an invoice the SAT will reject).
 */
export function validateInvoiceInput(input: GenerateInvoiceInput): void {
  const errs: string[] = [];
  const rfc = input.receptor.rfc.toUpperCase().trim();
  const esGenerico = rfc === RFC_GENERICO_NACIONAL || rfc === RFC_GENERICO_EXTRANJERO;

  // Uso CFDI must look like a c_UsoCFDI key (e.g. G03, S01, CP01).
  if (!/^[A-Z]{1,3}\d{2}$/.test(input.receptor.usoCFDI.toUpperCase())) {
    errs.push(`Uso CFDI "${input.receptor.usoCFDI}" no es un código válido del catálogo c_UsoCFDI.`);
  }

  if (esGenerico) {
    // CFDI 4.0: InformacionGlobal (factura global) is required ONLY when the genérico
    // RFC is paired with Nombre "PÚBLICO EN GENERAL". Using a different Nombre (e.g.
    // "FACTURA GLOBAL") makes it a normal invoice — no InformacionGlobal needed.
    const nombre = input.receptor.nombreRazonSocial.trim().toUpperCase();
    const esPublicoGeneral = nombre === "PUBLICO EN GENERAL" || nombre === "PÚBLICO EN GENERAL";
    if (esPublicoGeneral && !input.facturaGlobal) {
      errs.push(
        `El receptor ${rfc} con Nombre "PÚBLICO EN GENERAL" requiere Información Global ` +
          `(facturaGlobal). Para una factura normal usa otro Nombre (p. ej. "FACTURA GLOBAL").`,
      );
    }
    // Uso must be S01 and régimen 616 for the genérico either way.
    if (input.receptor.usoCFDI.toUpperCase() !== "S01") {
      errs.push(`Para ${rfc} el Uso CFDI debe ser S01 (Sin efectos fiscales).`);
    }
    if (rfc === RFC_GENERICO_NACIONAL && input.receptor.regimenFiscalReceptor !== "616") {
      errs.push(`Para ${rfc} el Régimen Fiscal del receptor debe ser 616 (Sin obligaciones fiscales).`);
    }
  }

  if (input.facturaGlobal) {
    const { periodicidad, meses, anio } = input.facturaGlobal;
    if (!/^0[1-5]$/.test(periodicidad)) errs.push(`Periodicidad "${periodicidad}" inválida (c_Periodicidad 01–05).`);
    if (!/^(0[1-9]|1[0-8])$/.test(meses)) errs.push(`Mes "${meses}" inválido (c_Meses 01–18).`);
    if (anio < 2021 || anio > 2100) errs.push(`Año "${anio}" fuera de rango.`);
  }

  if (errs.length) {
    throw new ValidationError(`Factura inválida (CFDI 4.0): ${errs.join(" ")}`, { rfc, errs });
  }
}

export type GenerateInvoiceResult =
  | { status: "previewed"; preview: InvoicePreview }
  | { status: "issued"; issued: IssuedInvoice };

/**
 * Issue a CFDI. SAFETY GATE: with `confirmed:false` we build the form and return
 * the vista previa, and STOP — never clicking emit. Only a follow-up call with
 * `confirmed:true` (after an explicit human "yes") seals/emits the invoice.
 */
export async function generateInvoice(
  ctx: FlowContext,
  input: GenerateInvoiceInput,
): Promise<GenerateInvoiceResult> {
  const { session } = ctx;

  // Safeguard: reject CFDI-invalid input up front (before login/captcha).
  validateInvoiceInput(input);

  step(ctx, "Iniciando sesión para facturar");
  await login(session, ctx.credential, {
    correlationId: ctx.correlationId,
    target: "factura",
    onLiveView: (url) => ctx.emit?.({ kind: "live_view", label: "Resuelve el captcha", status: "started", liveViewUrl: url }),
  });

  step(ctx, "Configuración de Datos V 4.0");
  await openFacturaConfigMenu(session);

  step(ctx, "Abriendo Genera Factura");
  await openNuevaFactura(session);
  // The form is built client-side into #groupcontainer behind the #myModal
  // "Cargando información" splash, and the page reloads once mid-load — which makes
  // a plain waitForHidden(#myModal) return early on the torn-down DOM. So wait on
  // the real "ready" signal: the first form field actually rendered and visible.
  // (Playwright keeps polling the live DOM, so this survives the reload.)
  await session.waitFor(SEL.factura.moneda, { state: "visible", timeoutMs: PORTAL_MODAL_TIMEOUT_MS });

  step(ctx, "Datos generales y del cliente");
  // Comprobante (Régimen/Tipo/Forma/Método de pago) are cintillo widgets pre-filled
  // from the emisor's Configuración de Datos — we leave the defaults untouched.
  // Moneda is a jQuery-UI autocomplete: type the code, then pick the first match.
  const moneda = input.moneda ?? "MXN";
  await autocompletePick(session, SEL.factura.moneda, moneda);
  if (moneda !== "MXN" && input.tipoCambio) {
    await session.fill(SEL.factura.tipoCambio, String(input.tipoCambio));
  }

  // Receptor — order requested: (1) select the RFC in Cliente Frecuente and let the
  // SAT auto-populate, (2) set the catalog fields we control, (3) override the name at
  // the end, (4) verify required fields and re-fill any that came back empty.
  await assertReceptorSelectorsCaptured();
  // PROVEN by DEBUG_FACTURA: selecting the genérico via Cliente Frecuente LOCKS the
  // Uso list to that client's single default ("Adquisición de mercancías" / G01) —
  // typing "Sin efectos fiscales" finds nothing and the value stays G01, which the
  // SAT rejects. "Otro" exposes the full régimen-616 Uso catalog (where S01 exists).
  await localAutocompletePick(session, SEL.factura.clienteFrecuente, "Otro");
  // Fill only EDITABLE fields — for público en general the SAT auto-fills and DISABLES
  // some receptor inputs (e.g. CP = emisor's CP). Forcing a disabled field just hangs;
  // skip it (the SAT already holds the correct value) and let the final check confirm.
  await fillIfEditable(session, SEL.factura.rfcReceptor, input.receptor.rfc, ctx, "RFC");
  await fillIfEditable(session, SEL.factura.nombreReceptor, input.receptor.nombreRazonSocial, ctx, "Nombre");
  await fillIfEditable(session, SEL.factura.codigoPostalReceptor, input.receptor.codigoPostal, ctx, "CP");
  await autocompletePick(session, SEL.factura.regimenReceptor, input.receptor.regimenFiscalReceptor);

  // Factura Global (InformacionGlobal) — required for público en general.
  if (input.facturaGlobal) {
    step(ctx, "Información global (factura al público en general)");
    await enableFacturaGlobal(session, input.facturaGlobal, ctx);
  }

  // Uso de la Factura: the SAT auto-fills a default (e.g. G01) that violates the
  // régimen↔uso rule, so override it. Best-effort here so diagnostics still print;
  // the final required-fields check fails loud if it didn't take.
  try {
    await setUsoCfdi(session, input.receptor.usoCFDI, ctx);
  } catch (e) {
    ctx.log.warn({ err: (e as Error).message }, "setUsoCfdi failed (continuing to diagnostics)");
  }

  // Override the receptor name LAST (e.g. "PUBLICO EN GENERAL" → "FACTURA GLOBAL").
  await session.fill(SEL.factura.nombreReceptor, input.receptor.nombreRazonSocial);

  await dumpReceptorState(session);
  // Verify the required receptor fields are populated; re-fill empties, fail if any
  // can't be set (the SAT rejects empty required fields at vista previa anyway).
  await ensureRequiredReceptorFields(session, input, ctx);

  step(ctx, "Agregando conceptos");
  await assertConceptoSelectorsCaptured();
  for (const c of input.conceptos) {
    await clickWithErrorDismiss(session, SEL.factura.agregarConcepto);
    // The edit row renders after "Agregar"; wait for its first field before filling.
    await session.waitFor(SEL.factura.descripcion, { state: "visible", timeoutMs: 10_000 });
    // ClaveProdServ / ClaveUnidad are catalog autocompletes; the rest are plain inputs.
    if (c.claveProdServ) await autocompletePick(session, SEL.factura.claveProdServ, c.claveProdServ);
    await session.fill(SEL.factura.descripcion, c.descripcion);
    if (c.claveUnidad) await autocompletePick(session, SEL.factura.claveUnidad, c.claveUnidad);
    await session.fill(SEL.factura.cantidad, String(c.cantidad));
    await session.fill(SEL.factura.valorUnitario, String(c.valorUnitario));
    await session.fill(SEL.factura.descuento, String(c.descuento ?? 0));
    if (c.objetoImpuesto) await session.selectOption(SEL.factura.objetoImpuesto, c.objetoImpuesto);
    if (c.numeroIdentificacion)
      await session.fill(SEL.factura.numeroIdentificacion, c.numeroIdentificacion);
    await dismissErrorModals(session);
    await clickWithErrorDismiss(session, SEL.factura.guardarConcepto);
    await session.waitForHidden(SEL.factura.loadingModal);
  }

  step(ctx, "Guardando borrador");
  await dismissErrorModals(session);
  await clickWithErrorDismiss(session, SEL.factura.guardar);
  await session.waitForHidden(SEL.factura.loadingModal);

  step(ctx, "Generando vista previa");
  await dismissErrorModals(session);
  const download = await session.captureDownload(async () => {
    await clickWithErrorDismiss(session, SEL.factura.vistaPrevia);
  });
  const previewArtifact = await storeArtifact("pdf", download.buffer, {
    correlationId: ctx.correlationId,
    label: "vista-previa",
  });

  // Hand the preview PDF to Claude for an at-a-glance analysis (parties, timbrado,
  // insight) — same pattern as the CSF. Best-effort: never blocks the preview.
  step(ctx, "Analizando la vista previa con Claude");
  const analysis = (await extractInvoiceFromPdf(download.buffer, ctx.correlationId)) ?? undefined;

  const subtotal = round2(
    input.conceptos.reduce((s, c) => s + c.cantidad * c.valorUnitario - (c.descuento ?? 0), 0),
  );
  const iva = round2(subtotal * 0.16);
  const preview: InvoicePreview = {
    receptorRfc: input.receptor.rfc,
    conceptos: input.conceptos as unknown as Record<string, unknown>[],
    subtotal,
    iva,
    total: round2(subtotal + iva),
    rawArtifactId: previewArtifact.id,
    analysis,
  };
  if (analysis?.insight) {
    ctx.emit?.({ kind: "scraping", label: `Análisis: ${analysis.insight}`, status: "ok" });
  }

  // ---- SAFETY GATE ----
  if (!input.confirmed) {
    ctx.emit?.({ kind: "scraping", label: "Vista previa lista — esperando confirmación", status: "ok" });
    return { status: "previewed", preview };
  }

  // Confirmed by a human: seal/emit.
  step(ctx, "Sellando y emitiendo la factura");
  await clickWithErrorDismiss(session, SEL.factura.sellar);
  await session.waitForHidden(SEL.factura.loadingModal);

  const uuid = await session
    .innerText("#folioFiscal, .uuid, [data-uuid]")
    .catch(() => "");
  ctx.emit?.({ kind: "done", label: `Factura emitida ${uuid}`, status: "ok" });
  return { status: "issued", issued: { uuid: uuid.trim(), pdfArtifactId: previewArtifact.id } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The GeneraFactura portal throws up #myModal (with a modal-backdrop) while it
// builds the Knockout form, and it can take a long time to clear on a cold page —
// the backdrop intercepts navbar clicks until then. Wait it out, and give clicks
// the same budget so their auto-retry can outlast a late-appearing backdrop.
const PORTAL_MODAL_TIMEOUT_MS = 150_000; // 2.5 min

/**
 * Open a Bootstrap navbar dropdown and click an item. The SAT toggles are
 * `<a href="#" data-toggle="dropdown">` whose handler binds late — a plain click
 * sometimes navigates to "#" instead of opening the menu, leaving the item
 * hidden. So: click the toggle, wait briefly for the item to show; if it never
 * does, fall back to navigating to the item's own resolved href — which is
 * exactly what clicking the link would have done, just without the flaky JS.
 */
async function openNavDropdownItem(
  session: Session,
  toggleSel: string,
  itemSel: string,
  opts: { clickTimeoutMs?: number } = {},
): Promise<void> {
  if (await session.exists(toggleSel)) {
    await session.click(toggleSel, { timeoutMs: opts.clickTimeoutMs }).catch(() => void 0);
  }
  try {
    await session.waitFor(itemSel, { state: "visible", timeoutMs: 5000 });
    await session.click(itemSel, { timeoutMs: opts.clickTimeoutMs });
  } catch {
    const href = await resolveHref(session, itemSel);
    if (!href || href.endsWith("#")) {
      throw new Error(`No pude abrir el menú ni resolver el href de ${itemSel}`);
    }
    await session.goto(href);
  }
  await session.waitForLoad();
}

/** Absolute href of the first element matching `selector` (DOM `.href` resolves it). */
async function resolveHref(session: Session, selector: string): Promise<string | null> {
  return session
    .evaluate<string | null>(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.href : null; })()`,
    )
    .catch(() => null);
}

async function openFacturaConfigMenu(session: Session): Promise<void> {
  await openNavDropdownItem(session, SEL.facturaNav.menuToggle, SEL.facturaNav.configOption);
}

async function openNuevaFactura(session: Session): Promise<void> {
  // If the Configuración-de-datos link already dropped us on the form, do NOT
  // re-open it via the "Generar" dropdown — that triggers another slow full reload.
  if (session.url().includes("/Factura/GeneraFactura")) return;
  // Otherwise the config page may still be building the form (#myModal) — let it
  // settle so the backdrop doesn't swallow our navbar clicks.
  await session.waitForHidden(SEL.factura.loadingModal, { timeoutMs: PORTAL_MODAL_TIMEOUT_MS });
  await openNavDropdownItem(session, SEL.facturaNav.generarToggle, SEL.facturaNav.nuevaFactura, {
    clickTimeoutMs: PORTAL_MODAL_TIMEOUT_MS,
  });
}

/**
 * Pick from a SERVER-backed autocomplete (has data-catalogourl: moneda, régimen,
 * cliente frecuente, prod/serv, unidad). These search on `input`, debounced + over
 * the network, so we set the term with `fill` and then pick the single match. Typing
 * char-by-char here races the debounce and can select a partial-term result.
 */
async function autocompletePick(
  session: Session,
  selector: string,
  value: string,
): Promise<void> {
  await session.fill(selector, value);
  await session.type(selector, " ");
  await session.fill(selector, value);
  await session.waitFor(SEL.factura.autocompleteMenu, { state: "visible", timeoutMs: 5000 });
  await dbg(session, `server-pick "${value}"`, selector, "menu");
  await session.click(SEL.factura.autocompleteMenu);
  await session.waitForHidden(SEL.factura.loadingModal);
  await dbg(session, `server-pick "${value}"`, selector, "after");
}

/**
 * Diagnostic: log what the visible autocomplete menu offers and the field's runtime
 * value, so a single run shows EXACTLY what each interaction did (vs. guessing from a
 * static dump). Gate with DEBUG_FACTURA=1.
 */
async function dbg(session: Session, label: string, selector: string, phase: "menu" | "after"): Promise<void> {
  if (process.env.DEBUG_FACTURA !== "1") return;
  if (phase === "menu") {
    const items = await session
      .evaluate<string[]>(
        `[...document.querySelectorAll('ul.ui-autocomplete:visible li')].map(li => (li.textContent||'').trim())`,
      )
      .catch(() => []);
    console.log(`  🔎 ${label} → menú visible: ${JSON.stringify(items)}`);
  } else {
    const v = await readValue(session, selector);
    console.log(`  ✅ ${label} → quedó: ${JSON.stringify(v)}`);
  }
}

/** Diagnostic: dump the runtime value of every receptor field at once. DEBUG_FACTURA=1. */
async function dumpReceptorState(session: Session): Promise<void> {
  if (process.env.DEBUG_FACTURA !== "1") return;
  const fields: Record<string, string> = {
    clienteFrecuente: SEL.factura.clienteFrecuente,
    rfcReceptor: SEL.factura.rfcReceptor,
    nombreReceptor: SEL.factura.nombreReceptor,
    codigoPostalReceptor: SEL.factura.codigoPostalReceptor,
    regimenReceptor: SEL.factura.regimenReceptor,
    usoCfdi: SEL.factura.usoCfdi,
  };
  console.log("  📋 Estado del receptor:");
  for (const [name, sel] of Object.entries(fields)) {
    const v = await readValue(session, sel);
    console.log(`     ${name}: ${JSON.stringify(v)}`);
  }
}

/** Runtime `.value` of the first element matching `selector` ("" if none/hidden). */
function readValue(session: Session, selector: string): Promise<string> {
  // session.inputValue (Playwright locator) supports `:visible`, unlike querySelector.
  return session.inputValue(selector).catch(() => "");
}

/**
 * Resolver for hydration/disabled conflicts: the SAT enables/locks receptor inputs
 * dynamically (e.g. CP is auto-filled and DISABLED for público en general). Forcing a
 * disabled/hidden field just stalls Playwright for 30s, so fill ONLY when the field is
 * actually editable; otherwise skip it (the SAT already holds the right value).
 */
async function fillIfEditable(
  session: Session,
  selector: string,
  value: string,
  ctx: FlowContext,
  label: string,
): Promise<void> {
  if (await session.isEditable(selector)) {
    await session.fill(selector, value);
  } else {
    ctx.log.info({ label }, "campo no editable (auto-gestionado por el SAT) — se omite");
  }
}

/**
 * After the auto-populated receptor, re-fill the required fields that came back empty
 * (Nombre/CP/Régimen) and re-affirm Uso to the expected catalog value (the SAT default
 * is often wrong). Fail loud if a required field is still empty — the SAT would reject
 * it at vista previa anyway.
 */
async function ensureRequiredReceptorFields(
  session: Session,
  input: GenerateInvoiceInput,
  ctx: FlowContext,
): Promise<void> {
  if (!(await readValue(session, SEL.factura.nombreReceptor)).trim()) {
    await fillIfEditable(session, SEL.factura.nombreReceptor, input.receptor.nombreRazonSocial, ctx, "Nombre");
  }
  if (!(await readValue(session, SEL.factura.codigoPostalReceptor)).trim()) {
    await fillIfEditable(session, SEL.factura.codigoPostalReceptor, input.receptor.codigoPostal, ctx, "CP");
  }
  if (!(await readValue(session, SEL.factura.regimenReceptor)).trim()) {
    await autocompletePick(session, SEL.factura.regimenReceptor, input.receptor.regimenFiscalReceptor);
  }
  // Uso must match the requested code's description; re-set if empty or wrong.
  const usoVal = (await readValue(session, SEL.factura.usoCfdi)).toLowerCase();
  const expectedUso = (USO_CFDI_DESCRIPCION[input.receptor.usoCFDI.toUpperCase()] ?? "").toLowerCase();
  if (!usoVal || (expectedUso && !usoVal.includes(expectedUso))) {
    try {
      await setUsoCfdi(session, input.receptor.usoCFDI, ctx);
    } catch (e) {
      ctx.log.warn({ err: (e as Error).message }, "Uso CFDI re-set failed");
    }
  }

  const required: Record<string, string> = {
    "Nombre/Razón Social": SEL.factura.nombreReceptor,
    "Código Postal": SEL.factura.codigoPostalReceptor,
    "Régimen Fiscal": SEL.factura.regimenReceptor,
    "Uso de la Factura": SEL.factura.usoCfdi,
  };
  const empties: string[] = [];
  for (const [name, sel] of Object.entries(required)) {
    if (!(await readValue(session, sel)).trim()) empties.push(name);
  }
  if (empties.length) {
    throw new ValidationError(`Campos requeridos del receptor sin poblar: ${empties.join(", ")}.`);
  }
}

/**
 * Pick from a LOCAL/dependent jQuery-UI autocomplete (no data-catalogourl: Cliente
 * Frecuente, Uso de la Factura). It only searches on real keydown and the menu may not
 * float the match to the top — so we type real keystrokes and then click the OPTION
 * whose text matches `value` (NOT the first row, which would wrongly pick the default).
 * Waiting for that specific option also tells us loudly if it isn't offered at all.
 */
async function localAutocompletePick(
  session: Session,
  selector: string,
  value: string,
): Promise<void> {
  await session.fill(selector, "");
  await session.type(selector, value);
  // jQuery-UI renders matches as <li> under a visible <ul.ui-autocomplete>. Target the
  // option containing our text (case-insensitive substring) instead of first-child.
  const optionSel = `ul.ui-autocomplete:visible li:has-text(${JSON.stringify(value)})`;
  await dbg(session, `local-pick "${value}"`, selector, "menu");
  await session.waitFor(optionSel, { state: "visible", timeoutMs: 8000 });
  await session.click(optionSel);
  await session.waitForHidden(SEL.factura.loadingModal);
  await dbg(session, `local-pick "${value}"`, selector, "after");
}

/**
 * Set "Uso de la Factura" and confirm it stuck. The SAT pre-fills a default Uso when
 * a client is picked and may reset it on re-renders, so we pick the catalog code and
 * verify the field's value reflects it (retrying once), failing loud otherwise — an
 * invalid Uso↔régimen pair is rejected by the SAT only later, at sellar/vista previa.
 */
async function setUsoCfdi(session: Session, uso: string, ctx: FlowContext): Promise<void> {
  // The Uso control filters by DESCRIPTION, not code — type the description so the
  // local autocomplete matches (typing "S01" would match nothing and keep the
  // pre-filled default). Fall back to the raw code if it's not in the catalog map.
  const descripcion = USO_CFDI_DESCRIPCION[uso.toUpperCase()];
  const query = descripcion ?? uso;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await localAutocompletePick(session, SEL.factura.usoCfdi, query);
    // Confirm the right Uso actually stuck (reads the VISIBLE uso variant's value).
    const value = await readValue(session, SEL.factura.usoCfdi);
    const ok = descripcion
      ? value.toLowerCase().includes(descripcion.toLowerCase())
      : value.trim().length > 0;
    if (ok) return;
    ctx.log.warn({ uso, query, value, attempt }, "Uso CFDI did not stick, retrying");
  }
  throw new ValidationError(
    `No pude fijar el Uso CFDI "${uso}" en el formulario. ` +
      `Verifica que el código corresponda al régimen del receptor (catálogo c_UsoCFDI).`,
  );
}

/**
 * Enable the InformacionGlobal section and fill Periodicidad/Mes/Año. The "Es una
 * Factura Global" checkbox (FAC111) is bound via Knockout but rendered display:none
 * for some emisores, so a normal click can't reach it — we toggle it through the KO
 * binding (set .checked + dispatch change/click) which reveals the Periodicidad row.
 */
async function enableFacturaGlobal(
  session: Session,
  global: NonNullable<GenerateInvoiceInput["facturaGlobal"]>,
  ctx: FlowContext,
): Promise<void> {
  // Check FAC111 with a NATIVE el.click(): it toggles unchecked→checked AND fires the
  // real change event KO needs to set the observable and create the InformacionGlobal
  // node. (Pre-setting .checked then dispatching 'click' would toggle it back OFF — the
  // bug that left InformacionGlobal missing.) el.click() works even on display:none.
  const checked = await session.evaluate<boolean>(
    `(() => {
      const el = document.querySelector(${JSON.stringify(SEL.factura.facturaGlobal)});
      if (!el) return false;
      if (!el.checked) el.click();
      return !!el.checked;
    })()`,
  );
  if (!checked) {
    ctx.log.warn("No pude marcar 'Es una Factura Global' (FAC111) — InformacionGlobal no se creará");
  }
  // Fill the InformacionGlobal trio. Periodicidad/Mes are <select> (commit on change);
  // Año binds on BLUR, so blur it explicitly or KO never reads the typed value.
  await session.waitFor(SEL.factura.periodicidad, { state: "visible", timeoutMs: 10_000 });
  await session.selectOption(SEL.factura.periodicidad, global.periodicidad);
  await session.selectOption(SEL.factura.mesesGlobal, global.meses);
  await session.fill(SEL.factura.anioGlobal, String(global.anio));
  await session.evaluate(
    `document.querySelector(${JSON.stringify(SEL.factura.anioGlobal)})?.blur()`,
  );
  await session.waitForHidden(SEL.factura.loadingModal);
  if (process.env.DEBUG_FACTURA === "1") {
    const [p, m, a] = await Promise.all([
      readValue(session, SEL.factura.periodicidad),
      readValue(session, SEL.factura.mesesGlobal),
      readValue(session, SEL.factura.anioGlobal),
    ]);
    console.log(`  🌐 Factura Global → checked=${checked} periodicidad=${JSON.stringify(p)} mes=${JSON.stringify(m)} año=${JSON.stringify(a)}`);
  }
}

async function assertReceptorSelectorsCaptured(): Promise<void> {
  const missing = (
    ["rfcReceptor", "nombreReceptor", "codigoPostalReceptor", "regimenReceptor", "usoCfdi"] as const
  ).filter((k) => !SEL.factura[k]);
  if (missing.length) {
    throw new Error(
      `Receptor selectors not yet captured: ${missing.join(", ")}. ` +
        `Pick "Otro" in Cliente Frecuente on /Factura/GeneraFactura, dump the revealed ` +
        `fields' view-model attributes, and fill SEL.factura.* in sat.ts.`,
    );
  }
}

/** Same guard for the conceptos grid (its section was truncated in the dump). */
async function assertConceptoSelectorsCaptured(): Promise<void> {
  const missing = (
    ["agregarConcepto", "descripcion", "cantidad", "valorUnitario", "guardarConcepto"] as const
  ).filter((k) => !SEL.factura[k]);
  if (missing.length) {
    throw new Error(
      `Concepto selectors not yet captured: ${missing.join(", ")}. ` +
        `Dump the conceptos section DOM on /Factura/GeneraFactura and fill SEL.factura.* in sat.ts.`,
    );
  }
}
