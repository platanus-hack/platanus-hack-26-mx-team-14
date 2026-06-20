import { childLogger, env } from "@sat/shared";
import { AuthError, CaptchaError } from "@sat/shared";
import type { Credential } from "@sat/events";
import type { Session } from "./types.js";
import { SAT_URLS, SEL } from "./sat.js";
import { solveCaptcha } from "./captcha.js";
import { storeArtifact } from "./artifacts.js";

export interface LoginCtx {
  correlationId: string;
  /** Which CIEC entry point to use (emitidas/recibidas vs. genera factura). */
  target?: "emitidas" | "factura";
  onLiveView?: (url: string) => void;
}

/**
 * Logs the session into the SAT using whichever credential kind we hold.
 *   - ciec:   RFC + Contraseña + image captcha (Claude vision, with retries;
 *             falls back to human live-view after CAPTCHA_MAX_ATTEMPTS).
 *   - efirma: .cer + .key + key password (file upload; SAT page signs the challenge).
 */
export async function login(
  session: Session,
  cred: Credential,
  ctx: LoginCtx,
): Promise<void> {
  if (cred.kind === "ciec") return loginCiec(session, cred, ctx);
  return loginEfirma(session, cred, ctx);
}

async function loginCiec(
  session: Session,
  cred: Extract<Credential, { kind: "ciec" }>,
  ctx: LoginCtx,
): Promise<void> {
  const log = childLogger({ correlationId: ctx.correlationId, rfc: cred.rfc, op: "login.ciec" });
  const url = ctx.target === "factura" ? SAT_URLS.cfdiLoginFactura : SAT_URLS.cfdiLoginEmitidas;
  await session.goto(url);
  await session.waitFor(SEL.ciec.rfc);

  const maxAttempts = env.CAPTCHA_MAX_ATTEMPTS;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await session.fill(SEL.ciec.rfc, cred.rfc);
    await session.fill(SEL.ciec.password, cred.password);

    // Read captcha image → Claude vision → type it.
    const img = await session.screenshot(SEL.ciec.captchaImg);
    const solution = await solveCaptcha(img, ctx);
    await session.fill(SEL.ciec.captchaInput, solution);
    await session.click(SEL.ciec.submit);
    await session.waitForLoad();

    if (!(await onLoginPage(session))) {
      log.info({ attempt }, "CIEC login ok");
      return;
    }

    // Still on login: distinguish bad captcha (retry) from bad credentials (fatal).
    const errText = (await safeText(session, SEL.ciec.loginError)).toLowerCase();
    if (errText.includes("contraseña") || errText.includes("usuario") || errText.includes("bloquead")) {
      throw new AuthError("SAT rejected RFC/Contraseña", { rfc: cred.rfc, errText });
    }
    log.warn({ attempt, errText }, "captcha likely wrong, retrying");
  }

  // Captcha kept failing → offer human takeover (Firecrawl live view).
  const live = await session.liveViewUrl();
  if (live && ctx.onLiveView) {
    ctx.onLiveView(live);
    throw new CaptchaError("Captcha unsolved after retries — handed to live-view", { liveViewUrl: live });
  }
  const shot = await session.screenshot();
  const a = await storeArtifact("png", shot, { correlationId: ctx.correlationId, label: "captcha-fail" });
  throw new CaptchaError("Captcha unsolved after retries", { artifactId: a.id });
}

async function loginEfirma(
  session: Session,
  cred: Extract<Credential, { kind: "efirma" }>,
  ctx: LoginCtx,
): Promise<void> {
  const log = childLogger({ correlationId: ctx.correlationId, rfc: cred.rfc, op: "login.efirma" });
  const url = ctx.target === "factura" ? SAT_URLS.cfdiLoginFactura : SAT_URLS.cfdiLoginEmitidas;
  await session.goto(url);

  // Switch to the e.firma tab if present.
  if (await session.exists(SEL.efirma.tab)) await session.click(SEL.efirma.tab);
  await session.waitFor(SEL.efirma.cerInput);

  await session.setInputFiles(SEL.efirma.cerInput, [
    { name: `${cred.rfc}.cer`, buffer: cred.cer, mimeType: "application/x-x509-ca-cert" },
  ]);
  await session.setInputFiles(SEL.efirma.keyInput, [
    { name: `${cred.rfc}.key`, buffer: cred.key, mimeType: "application/octet-stream" },
  ]);
  await session.fill(SEL.efirma.keyPassword, cred.keyPassword);
  await session.click(SEL.efirma.submit);
  await session.waitForLoad();

  if (await onLoginPage(session)) {
    throw new AuthError("SAT rejected e.firma (.cer/.key/password)", { rfc: cred.rfc });
  }
  log.info("e.firma login ok");
}

/** Heuristic: are we still sitting on a cfdiau login page? */
async function onLoginPage(session: Session): Promise<boolean> {
  return session.url().includes("cfdiau.sat.gob.mx") && (await session.exists(SEL.ciec.rfc));
}

async function safeText(session: Session, selector: string): Promise<string> {
  try {
    if (await session.exists(selector)) return await session.innerText(selector);
  } catch {
    /* ignore */
  }
  return "";
}
