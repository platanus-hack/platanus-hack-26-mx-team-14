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

  const log = ctx.log.child({ op: "generateCSF" });
  step(ctx, "Iniciando sesión en el Portal SAT");
  log.info("opening Portal SAT login");
  await session.goto(SAT_URLS.portalLogin);
  await session.waitFor(SEL.portal.rfc);
  log.info("login form ready, filling RFC + contraseña");
  await session.fill(SEL.portal.rfc, credential.rfc);
  await session.fill(SEL.portal.password, credential.password);
  await session.click(SEL.portal.submit);
  await session.waitForLoad();
  log.info({ url: session.url() }, "portal login submitted");

  step(ctx, "Generando la Constancia de Situación Fiscal");
  log.info("navigating to Mi Espacio, waiting for Constancia button");
  await session.goto(SAT_URLS.miEspacio);
  // Wait for full page load before scanning for the button (SAT portal is slow)
  await session.waitForLoad();
  await session.waitFor(SEL.csf.constanciaLink, { timeoutMs: 30_000 });
  log.info("Constancia button visible");

  // The portal sometimes shows an intermediate page before the actual PDF download.
  // Strategy: start listening for the download event, click the primary button,
  // wait up to 5 s for an intermediate "Generar/Descargar" button — if one appears
  // click it too. The captureDownload timeout is generous (90 s) to cover slow SAT servers.
  const download = await session.captureDownload(async () => {
    await session.click(SEL.csf.constanciaLink);
    // Intermediate page — click the download trigger if it appears within 5 s.
    await session.waitFor(SEL.csf.descargar, { timeoutMs: 5000 }).catch(() => void 0);
    if (await session.exists(SEL.csf.descargar)) {
      await session.click(SEL.csf.descargar);
    }
  }, 90_000);
  const pdf = await storeArtifact("pdf", download.buffer, {
    correlationId: ctx.correlationId,
    label: "csf",
  });

  step(ctx, "Leyendo la constancia con Claude");
  const fields = await extractCSFFromPdf(download.buffer, ctx.correlationId);

  ctx.emit?.({
    kind: "scraping",
    label: `Régimen: ${fields.regimenFiscal.map((r) => r.nombre).join(", ") || "—"} · ${fields.obligaciones.length} obligaciones`,
    status: "ok",
  });
  return { ...fields, pdfArtifactId: pdf.id };
}
