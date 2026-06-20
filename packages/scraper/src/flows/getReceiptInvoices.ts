import type { GetReceiptInvoicesInput, Invoice } from "@sat/events";
import { login } from "../auth.js";
import { SAT_URLS, SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { parseInvoiceRows } from "./parse.js";
import { type FlowContext, step } from "./context.js";

/** Pull facturas recibidas (received CFDIs) for a date range. Read-only. */
export async function getReceiptInvoices(
  ctx: FlowContext,
  input: GetReceiptInvoicesInput,
): Promise<Invoice[]> {
  const { session } = ctx;

  step(ctx, "Iniciando sesión en el SAT");
  await login(session, ctx.credential, {
    correlationId: ctx.correlationId,
    target: "emitidas",
    onLiveView: (url) => ctx.emit?.({ kind: "live_view", label: "Resuelve el captcha", status: "started", liveViewUrl: url }),
  });

  step(ctx, "Abriendo Consulta de Facturas Recibidas");
  await session.goto(SAT_URLS.consultaReceptor);
  await session.waitFor(SEL.consulta.fechaTab);
  await session.click(SEL.consulta.fechaTab);

  step(ctx, "Aplicando rango de fechas y filtros");
  await session.fill(SEL.consulta.fechaInicial, input.from);
  await session.fill(SEL.consulta.fechaFinal, input.to);
  if (input.rfcEmisor) await session.fill(SEL.consulta.rfcEmisor, input.rfcEmisor);
  if (input.estado) await session.selectOption(SEL.consulta.estado, input.estado);

  step(ctx, "Buscando CFDI");
  await session.click(SEL.consulta.buscar);
  await session.waitForHidden(SEL.consulta.loadingMask);
  await session.waitFor(SEL.consulta.resultsTable, { timeoutMs: 30000 });

  const html = Buffer.from(await session.innerText(SEL.consulta.resultsTable), "utf8");
  await storeArtifact("html", html, { correlationId: ctx.correlationId, label: "recibidas" });

  const invoices = await parseInvoiceRows(session, "recibidas");
  ctx.emit?.({ kind: "scraping", label: `Encontradas ${invoices.length} facturas`, status: "ok" });
  return invoices;
}
