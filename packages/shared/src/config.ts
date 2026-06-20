import { z } from "zod";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Centralized, validated environment config. Import `env` anywhere.
 * Fails fast at boot if a required var is missing/malformed.
 *
 * Var names follow the project docker-compose:
 *   - POSTGRES_CONNECTION_STRING (DB)
 *   - REDIS_HOST / REDIS_PORT / REDIS_PASSWORD (or REDIS_URL)
 *   - ENCRYPTION_KEY (credential sealing)
 *   - PORT / HOST (api)
 * Legacy aliases (DATABASE_URL, REDIS_URL, CRED_ENC_KEY, API_PORT) are still accepted.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database — compose passes POSTGRES_CONNECTION_STRING; DATABASE_URL is a fallback.
  POSTGRES_CONNECTION_STRING: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),

  // Redis — compose passes host/port/password; REDIS_URL is a fallback (local dev).
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),

  SAT_DRIVER: z.enum(["playwright", "firecrawl"]).default("playwright"),
  FIRECRAWL_API_KEY: z.string().optional(),
  ARTIFACTS_DIR: z.string().default("./artifacts-local"),
  CAPTCHA_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Credential encryption (32 bytes, base64). Compose calls it ENCRYPTION_KEY.
  ENCRYPTION_KEY: z.string().optional(),
  CRED_ENC_KEY: z.string().optional(),

  // API server — compose passes HOST + PORT (default 3000). API_PORT is a fallback.
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().optional(),
  WEB_ORIGIN: z.string().default("http://localhost:3001"),

  VOICE_PROVIDER: z.enum(["vapi", "elevenlabs"]).default("vapi"),
  VAPI_API_KEY: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  JWT_SECRET: z.string().default("dev-jwt-secret-change-in-prod"),

  ELEVENLABS_VOICE_ID: z.string().default("EXAVITQu4vr4xnSDxMaL"),
});

type Raw = z.infer<typeof schema>;

export interface Env extends Raw {
  /** Resolved database URL (POSTGRES_CONNECTION_STRING ?? DATABASE_URL). */
  databaseUrl?: string;
  /** Resolved credential key (ENCRYPTION_KEY ?? CRED_ENC_KEY). */
  encryptionKey?: string;
  /** Resolved API port (PORT ?? API_PORT ?? 3000). */
  apiPort: number;
  /** ioredis connection options (works for BullMQ + plain clients). */
  redis: { host: string; port: number; password?: string; tls?: object };
}

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  try {
    let dir = process.cwd();
    for (let i = 0; i < 4; i++) {
      const p = join(dir, ".env");
      if (existsSync(p)) {
        (process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(p);
        break;
      }
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // no .env in cwd or parents — fine
  }

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const raw = parsed.data;

  // Prefer explicit host/port/password; if only REDIS_URL is given, parse it.
  let redis: { host: string; port: number; password?: string; tls?: object } = {
    host: raw.REDIS_HOST,
    port: raw.REDIS_PORT,
    password: raw.REDIS_PASSWORD,
    tls: raw.REDIS_HOST !== "localhost" && raw.REDIS_HOST !== "sat-redis" ? {} : undefined,
  };
  if (raw.REDIS_URL && source.REDIS_HOST === undefined) {
    try {
      const u = new URL(raw.REDIS_URL);
      redis = {
        host: u.hostname,
        port: u.port ? Number(u.port) : 6379,
        password: u.password || undefined,
        tls: u.protocol === "rediss:" ? {} : undefined,
      };
    } catch {
      /* keep host/port defaults */
    }
  }

  cached = {
    ...raw,
    databaseUrl: raw.POSTGRES_CONNECTION_STRING ?? raw.DATABASE_URL,
    encryptionKey: raw.ENCRYPTION_KEY ?? raw.CRED_ENC_KEY,
    apiPort: raw.PORT ?? raw.API_PORT ?? 3000,
    redis,
  };
  return cached;
}

export const env: Env = loadEnv();
