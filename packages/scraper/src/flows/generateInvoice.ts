import type { GenerateInvoiceInput, InvoicePreview, IssuedInvoice } from "@sat/events";
import type { Session } from "../types.js";
import { login } from "../auth.js";
import { SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { type FlowContext, step } from "./context.js";

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

  // Receptor. Typing the RFC into "Cliente Frecuente" offers it when it's a saved
  // client or XAXX010101000 (público en general); picking it auto-fills Nombre/Uso
  // and KEEPS the RFC field hidden (display:none) — so we must NOT touch the RFC
  // field on this path. If the RFC isn't offered, fall back to "Otro", which reveals
  // the manual RFC/Nombre inputs for us to capture.
  await assertReceptorSelectorsCaptured();
  const fromFrequent = await tryAutocompletePick(
    session,
    SEL.factura.clienteFrecuente,
    input.receptor.rfc,
  );
  if (!fromFrequent) {
    await autocompletePick(session, SEL.factura.clienteFrecuente, "Otro");
    await session.fill(SEL.factura.rfcReceptor, input.receptor.rfc);
    await session.fill(SEL.factura.nombreReceptor, input.receptor.nombreRazonSocial);
  }
  await session.fill(SEL.factura.codigoPostalReceptor, input.receptor.codigoPostal);
  // Régimen Fiscal and Uso de la Factura are server-backed jQuery-UI autocompletes
  // (type the catalog code, pick the first match), not <select> dropdowns. Uso is
  // best-effort: a frequent client may have pre-filled (and locked) it.
  await autocompletePick(session, SEL.factura.regimenReceptor, input.receptor.regimenFiscalReceptor);
  await tryAutocompletePick(session, SEL.factura.usoCfdi, input.receptor.usoCFDI);

  step(ctx, "Agregando conceptos");
  await assertConceptoSelectorsCaptured();
  for (const c of input.conceptos) {
    await session.click(SEL.factura.agregarConcepto);
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
    await session.click(SEL.factura.guardarConcepto);
    await session.waitForHidden(SEL.factura.loadingModal);
  }

  step(ctx, "Guardando borrador");
  await session.click(SEL.factura.guardar);
  await session.waitForHidden(SEL.factura.loadingModal);

  step(ctx, "Generando vista previa");
  const download = await session.captureDownload(async () => {
    await session.click(SEL.factura.vistaPrevia);
  });
  const previewArtifact = await storeArtifact("pdf", download.buffer, {
    correlationId: ctx.correlationId,
    label: "vista-previa",
  });

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
  };

  // ---- SAFETY GATE ----
  if (!input.confirmed) {
    ctx.emit?.({ kind: "scraping", label: "Vista previa lista — esperando confirmación", status: "ok" });
    return { status: "previewed", preview };
  }

  // Confirmed by a human: seal/emit.
  step(ctx, "Sellando y emitiendo la factura");
  await session.click(SEL.factura.sellar);
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

async function autocompletePick(
  session: Session,
  selector: string,
  value: string,
): Promise<void> {
  await session.fill(selector, value);
  await session.type(selector, " ");
  await session.fill(selector, value);
  await session.waitFor(SEL.factura.autocompleteMenu, { state: "visible", timeoutMs: 5000 });
  await session.click(SEL.factura.autocompleteMenu);
  await session.waitForHidden(SEL.factura.loadingModal);
}

/** autocompletePick that swallows failures (e.g. no menu appeared) and reports success. */
async function tryAutocompletePick(
  session: Session,
  selector: string,
  value: string,
): Promise<boolean> {
  try {
    await autocompletePick(session, selector, value);
    return true;
  } catch {
    return false;
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
