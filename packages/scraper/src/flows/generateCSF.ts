import type { CSF } from "@sat/events";
import { AuthError } from "@sat/shared";
import { SAT_URLS, SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { extractCSFFromPdf } from "../csf-extract.js";
import { type FlowContext, step } from "./context.js";

/**
 * Download the Constancia de Situación Fiscal (PDF) and extract its fields.
 * Uses the Portal SAT login (RFC + Contraseña), which is separate from the CIEC
 * cfdiau captcha flow. (e.firma is also accepted on this portal.)
 */
export async function generateCSF(ctx: FlowContext): Promise<CSF> {
  const { session, credential } = ctx;
  if (credential.kind !== "ciec") {
    // The portal CSF flow here is wired for RFC+Contraseña; e.firma path TODO.
    throw new AuthError("generateCSF currently requires a CIEC credential");
  }

  step(ctx, "Iniciando sesión en el Portal SAT");
  await session.goto(SAT_URLS.portalLogin);
  await session.waitFor(SEL.portal.rfc);
  await session.fill(SEL.portal.rfc, credential.rfc);
  await session.fill(SEL.portal.password, credential.password);
  await session.click(SEL.portal.submit);
  await session.waitForLoad();

  step(ctx, "Generando la Constancia de Situación Fiscal");
  await session.goto(SAT_URLS.miEspacio);
  await session.waitFor(SEL.csf.constanciaLink);

  const download = await session.captureDownload(async () => {
    await session.click(SEL.csf.constanciaLink);
  });
  const pdf = await storeArtifact("pdf", download.buffer, {
    correlationId: ctx.correlationId,
    label: "csf",
  });

  step(ctx, "Leyendo la constancia con Claude");
  const fields = await extractCSFFromPdf(download.buffer, ctx.correlationId);

  ctx.emit?.({
    kind: "scraping",
    label: `Régimen: ${fields.regimenFiscal.join(", ") || "—"} · ${fields.obligaciones.length} obligaciones`,
    status: "ok",
  });
  return { ...fields, pdfArtifactId: pdf.id };
}
