import type { GetEmitedInvoicesInput, Invoice } from "@sat/events";
import { login } from "../auth.js";
import { SAT_URLS, SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { parseInvoiceRows } from "./parse.js";
import { setCalendarDate, toDdMmYyyy } from "./consulta-helpers.js";
import { type FlowContext, step } from "./context.js";

/** Pull facturas emitidas (issued CFDIs) for a date range. Read-only. */
export async function getEmitedInvoices(
  ctx: FlowContext,
  input: GetEmitedInvoicesInput,
): Promise<Invoice[]> {
  const { session } = ctx;

  step(ctx, "Iniciando sesión en el SAT");
  await login(session, ctx.credential, {
    correlationId: ctx.correlationId,
    target: "emitidas",
    onLiveView: (url) => ctx.emit?.({ kind: "live_view", label: "Resuelve el captcha", status: "started", liveViewUrl: url }),
  });

  step(ctx, "Abriendo Consulta de Facturas Emitidas");
  await session.goto(SAT_URLS.consultaEmisor);
  await session.waitFor(SEL.consulta.modoFechas);
  await session.click(SEL.consulta.modoFechas); // search by date range
  await session.waitForLoad();

  step(ctx, "Aplicando rango de fechas y filtros");
  await setCalendarDate(session, SEL.consulta.fechaInicial, toDdMmYyyy(input.from));
  await setCalendarDate(session, SEL.consulta.fechaFinal, toDdMmYyyy(input.to));
  if (input.rfcReceptor) await session.fill(SEL.consulta.rfcReceptor, input.rfcReceptor).catch(() => void 0);
  if (input.estado) await session.selectOption(SEL.consulta.estado, input.estado).catch(() => void 0);

  step(ctx, "Buscando CFDI");
  await session.click(SEL.consulta.buscar);
  await session.waitForLoad();
  await session.waitForHidden(SEL.consulta.loadingMask);

  const html = await session.evaluate<string>("document.documentElement.outerHTML").catch(() => "");
  if (html) await storeArtifact("html", Buffer.from(html, "utf8"), { correlationId: ctx.correlationId, label: "emitidas" });

  const invoices = await parseInvoiceRows(session, "emitidas", ctx.rfc);
  ctx.emit?.({ kind: "scraping", label: `Encontradas ${invoices.length} facturas`, status: "ok" });
  return invoices;
}
