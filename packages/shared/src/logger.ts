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
    ],
    censor: "[redacted]",
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export type Logger = typeof logger;

export function childLogger(bindings: {
  correlationId?: string;
  rfc?: string;
  [k: string]: unknown;
}): Logger {
  return logger.child(bindings);
}
