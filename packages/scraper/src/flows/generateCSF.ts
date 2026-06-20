import type { CSF } from "@sat/events";
import { AuthError } from "@sat/shared";
import { SAT_URLS, SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
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
  await session.waitFor("input[name='rfc'], #rfc");
  await session.fill("input[name='rfc'], #rfc", credential.rfc);
  await session.fill("input[name='password'], #password", credential.password);
  await session.click("button[type='submit'], #submit");
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

  step(ctx, "Extrayendo datos de la constancia");
  const fields = await extractCSF(download.buffer);

  ctx.emit?.({ kind: "scraping", label: `Régimen: ${fields.regimenFiscal.join(", ")}`, status: "ok" });
  return { ...fields, pdfArtifactId: pdf.id };
}

/**
 * Extract structured fields from the CSF PDF.
 * TODO(Phase 1): parse with pdf text extraction (or Claude document input).
 * Stubbed shape so the pipeline is end-to-end testable.
 */
async function extractCSF(_pdf: Buffer): Promise<Omit<CSF, "pdfArtifactId">> {
  return {
    rfc: "",
    nombre: "",
    regimenFiscal: [],
    domicilioFiscal: { codigoPostal: "" },
    obligaciones: [],
  };
}
