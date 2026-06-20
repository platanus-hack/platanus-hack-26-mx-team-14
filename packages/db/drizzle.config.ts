import { defineConfig, type Config } from "drizzle-kit";

try {
  (process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.("../../.env");
} catch {
  // fallback to ambient
}

const url =
  process.env.POSTGRES_CONNECTION_STRING ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/brisk_camel";

const config: Config = defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});

export default config;
