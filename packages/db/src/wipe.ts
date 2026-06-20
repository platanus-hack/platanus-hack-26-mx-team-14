/**
 * DESTRUCTIVE: truncates every application table in the configured database
 * (POSTGRES_CONNECTION_STRING / DATABASE_URL). Keeps the schema, drops all rows.
 * Run with: pnpm --filter @sat/db exec tsx src/wipe.ts
 */
import { sql } from "drizzle-orm";
import { db } from "./client.js";

const TABLES = ["artifacts", "documents", "events", "credentials", "users"];

async function main() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  console.log(`⚠️  Truncating: ${list}`);
  await db().execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`));
  console.log("✓ All tables wiped.");
  process.exit(0);
}

main().catch((err) => {
  console.error("wipe failed:", err);
  process.exit(1);
});
