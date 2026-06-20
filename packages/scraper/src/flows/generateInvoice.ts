import type { GenerateInvoiceInput, InvoicePreview, IssuedInvoice } from "@sat/events";
import { login } from "../auth.js";
import { SEL, SAT_URLS } from "../sat.js";
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

  step(ctx, "Abriendo Genera Factura");
  await session.goto(SAT_URLS.generaFactura);
  await session.waitForHidden(SEL.factura.loadingModal);

  step(ctx, "Datos generales y del cliente");
  const moneda = input.moneda ?? "MXN";
  await session.selectOption(SEL.factura.moneda, moneda);
  if (moneda !== "MXN" && input.tipoCambio) {
    await session.fill(SEL.factura.tipoCambio, String(input.tipoCambio));
  }
  await session.fill(SEL.factura.rfcReceptor, input.receptor.rfc);
  await session.fill(SEL.factura.nombreReceptor, input.receptor.nombreRazonSocial);
  await session.fill(SEL.factura.codigoPostal, input.receptor.codigoPostal);
  await session.selectOption(SEL.factura.regimenReceptor, input.receptor.regimenFiscalReceptor);
  await session.selectOption(SEL.factura.usoCfdi, input.receptor.usoCFDI);

  step(ctx, "Agregando conceptos");
  for (const c of input.conceptos) {
    await session.click(SEL.factura.agregarConcepto);
    if (c.claveProdServ) await session.fill(SEL.factura.claveProdServ, c.claveProdServ);
    await session.fill(SEL.factura.descripcion, c.descripcion);
    if (c.claveUnidad) await session.fill(SEL.factura.claveUnidad, c.claveUnidad);
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
