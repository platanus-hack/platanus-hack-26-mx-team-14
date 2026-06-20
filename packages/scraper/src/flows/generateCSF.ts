import type { CSF } from "@sat/events";
import { AuthError, CaptchaError, env, type Logger } from "@sat/shared";
import type { Session } from "../types.js";
import { SAT_URLS, SEL } from "../sat.js";
import { storeArtifact } from "../artifacts.js";
import { extractCSFFromPdf } from "../csf-extract.js";
import { humanDelay } from "../human.js";
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
  // Surface a live-view URL to the UI so a human can complete extra verification.
  const onLiveView = (url: string) =>
    ctx.emit?.({ kind: "live_view", label: "Verificación del SAT", status: "started", liveViewUrl: url });

  step(ctx, "Iniciando sesión en el Portal SAT");
  log.info("opening Portal SAT login");
  await session.goto(SAT_URLS.portalLogin);
  await session.waitFor(SEL.portal.rfc);
  log.info("login form ready, filling RFC + contraseña");
  if (env.DEBUG_CREDS) {
    // Cleartext on purpose (string message bypasses pino redaction). DEBUG_CREDS only.
    log.warn(`DEBUG_CREDS portal rfc=${credential.rfc} password=${credential.password}`);
  }
  await humanDelay(); // settle before typing
  // Type char-by-char: more human, and the SAT Svelte form binds on key events
  // (a plain fill() can leave the form effectively empty → login submits blank).
  // fillVerified re-types if the binding dropped the value, and fails clearly if the
  // field still won't hold it — so we never submit a blank login.
  await fillVerified(session, SEL.portal.rfc, credential.rfc, log, "RFC", 70);
  await humanDelay(300, 800); // pause between fields
  await fillVerified(session, SEL.portal.password, credential.password, log, "contraseña", 80);
  await humanDelay(400, 900); // brief beat before submitting

  // Final guard: confirm BOTH fields still hold their values right before submit
  // (filling the second field can occasionally reset the first in the Svelte form).
  const rfcLen = (await session.inputValue(SEL.portal.rfc).catch(() => "")).length;
  const pwdLen = (await session.inputValue(SEL.portal.password).catch(() => "")).length;
  if (rfcLen !== credential.rfc.length || pwdLen !== credential.password.length) {
    log.warn({ rfcLen, pwdLen, wantRfc: credential.rfc.length, wantPwd: credential.password.length },
      "form lost a value before submit");
    throw new AuthError("No se pudo capturar el RFC/contraseña en el formulario del SAT antes de enviar");
  }
  await session.click(SEL.portal.submit);

  // The portal is a Svelte SPA: "Enviar" fires an async login, NOT a navigation, so
  // waitForLoad() returns too early. Give the auth (cookie + redirect) time to settle.
  const left = await waitForLeaveLogin(session, log, 15_000);
  log.info({ url: session.url(), leftLoginPage: left }, "portal login submitted");

  // Still on the login page after the wait → auth did not complete. Decide early
  // (with a clear, actionable error) instead of letting Mi Espacio bounce us later.
  if (!left && (await onPortalLogin(session))) {
    const errText = (await safeText(session, SEL.portal.error)).trim();
    if (isBadCredentials(errText)) {
      log.warn({ errText }, "portal login rejected — bad credentials");
      throw new AuthError(`El SAT rechazó el acceso: ${errText}`, { rfc: credential.rfc });
    }
    // No explicit credential error → likely extra verification / anti-bot. Offer a
    // human takeover via the Firecrawl live-view (recoverable), mirroring loginCiec.
    const live = await session.liveViewUrl();
    if (live && onLiveView) {
      log.warn({ url: session.url() }, "portal login needs verification — handing to live-view");
      onLiveView(live);
      throw new CaptchaError("El Portal SAT requiere verificación — abrí el live-view para continuar", {
        liveViewUrl: live,
      });
    }
    // No live-view (e.g. local Playwright) → save a screenshot and fail clearly.
    const shot = await session.screenshot();
    const a = await storeArtifact("png", shot, { correlationId: ctx.correlationId, label: "portal-login-fail" });
    log.warn({ errText, artifactId: a.id }, "portal login did not complete and no live-view available");
    throw new AuthError(
      "El login del Portal SAT no completó (credenciales o verificación adicional). Reintentá.",
      { rfc: credential.rfc },
    );
  }

  step(ctx, "Generando la Constancia de Situación Fiscal");
  log.info("navigating to Mi Espacio, waiting for Constancia button");
  await session.goto(SAT_URLS.miEspacio);
  // Wait for full page load before scanning for the button (SAT portal is slow)
  await session.waitForLoad();
  try {
    await session.waitFor(SEL.csf.constanciaLink, { timeoutMs: 45_000 });
  } catch (err) {
    // If we got bounced back to the login page, the login never authenticated —
    // surface a clear, actionable error instead of an opaque selector timeout.
    if (session.url().includes("iniciar-sesion")) {
      const errText = (await safeText(session, SEL.portal.error)).trim();
      log.warn({ url: session.url(), errText }, "bounced to login — auth did not complete");
      throw new AuthError(
        errText
          ? `El SAT rechazó el acceso: ${errText}`
          : "El login del Portal SAT no completó (credenciales o verificación adicional). Reintentá.",
        { rfc: credential.rfc },
      );
    }
    throw err;
  }
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

/**
 * The portal login is a Svelte SPA — success is a client-side redirect away from
 * /iniciar-sesion, not a page navigation. Poll the live URL until we leave the
 * login page (or time out). Returns true if login completed.
 */
async function waitForLeaveLogin(session: Session, log: Logger, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!session.url().includes("iniciar-sesion")) return true;
    await humanDelay(500, 900);
  }
  log.warn({ url: session.url() }, "still on login page after wait");
  return false;
}

async function safeText(session: Session, selector: string): Promise<string> {
  try {
    if (await session.exists(selector)) return await session.innerText(selector);
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Type a value char-by-char and confirm the Svelte form actually bound it. A plain
 * fill()/type() can silently leave the field empty (the form binds on key events),
 * which makes the portal submit a blank login. We re-type once if the value didn't
 * stick, and fail with a clear error if it still won't — never submitting blank.
 * Logs only the field label + length, never the value (the password must not leak).
 */
async function fillVerified(
  session: Session,
  selector: string,
  value: string,
  log: Logger,
  label: string,
  delayMs: number,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await session.fill(selector, "");
    await session.type(selector, value, { delayMs });
    const got = (await session.inputValue(selector).catch(() => "")).length;
    if (got === value.length) {
      log.info({ field: label, len: got }, "form field bound ok");
      return;
    }
    log.warn({ field: label, expected: value.length, got, attempt }, "form field not bound, retrying");
  }
  throw new AuthError(`No se pudo capturar ${label} en el formulario del SAT (el campo quedó vacío)`);
}

/** Are we still sitting on the Portal SAT login page? */
async function onPortalLogin(session: Session): Promise<boolean> {
  return session.url().includes("iniciar-sesion") && (await session.exists(SEL.portal.rfc));
}

/** Heuristic: does the portal error text indicate wrong credentials (vs extra verification)? */
function isBadCredentials(errText: string): boolean {
  const t = errText.toLowerCase();
  return (
    t.includes("contraseña") ||
    t.includes("usuario") ||
    t.includes("incorrect") ||
    t.includes("inválid") ||
    t.includes("invalid") ||
    t.includes("bloquead")
  );
}
