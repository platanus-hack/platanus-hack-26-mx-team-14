import { pino } from "pino";
import { env } from "./config.js";

/**
 * Structured logger. Redacts anything that could carry SAT secrets/PII.
 * Always attach `correlationId` + `rfc` to child loggers for traceability.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "*.password",
      "contraseña",
      "*.contraseña",
      "keyPassword",
      "*.keyPassword",
      "cer",
      "key",
      "*.cer",
      "*.key",
      "enc_password",
      "encPassword",
      "*.encPassword",
      // The full RFC is PII; we only ever log the masked form (see maskRfc +
      // childLogger). These paths censor any raw RFC accidentally logged elsewhere.
      "rfcRaw",
      "*.rfcRaw",
    ],
    censor: "[redacted]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export type Logger = typeof logger;

/**
 * Masks an RFC for logs: keeps the first 3 and last 2 chars, hides the rest.
 * e.g. "XAXX010101000" → "XAX***00". Enough to correlate runs without exposing
 * the taxpayer's identity (use `correlationId` for exact tracing).
 */
export function maskRfc(rfc: string | undefined): string | undefined {
  if (!rfc) return rfc;
  const r = rfc.trim().toUpperCase();
  if (r.length <= 5) return "***";
  return `${r.slice(0, 3)}***${r.slice(-2)}`;
}

export function childLogger(bindings: {
  correlationId?: string;
  rfc?: string;
  [k: string]: unknown;
}): Logger {
  // Always mask the RFC at the binding level so no flow can leak it via logs.
  const { rfc, ...rest } = bindings;
  return logger.child(rfc === undefined ? rest : { ...rest, rfc: maskRfc(rfc) });
}
