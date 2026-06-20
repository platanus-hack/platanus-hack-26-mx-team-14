import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@sat/shared";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (_db) return _db;
  if (!env.databaseUrl) {
    throw new Error("No database URL set (POSTGRES_CONNECTION_STRING or DATABASE_URL)");
  }
  const client = postgres(env.databaseUrl, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
