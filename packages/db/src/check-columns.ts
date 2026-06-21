import { sql } from "drizzle-orm";
import { db } from "./client.js";

async function cols(table: string) {
  const rows = await db().execute<{ column_name: string }>(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table} ORDER BY ordinal_position`,
  );
  return (rows as unknown as { column_name: string }[]).map((r) => r.column_name);
}

async function main() {
  const users = await cols("users");
  const creds = await cols("credentials");
  console.log("users:", users.join(", "));
  console.log("credentials:", creds.join(", "));
  console.log("users.password_hash present:", users.includes("password_hash"));
  console.log("credentials.enc_password present:", creds.includes("enc_password"));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
