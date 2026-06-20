import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  customType,
  index,
} from "drizzle-orm/pg-core";

/** pgvector column type (dimensions match the embedding model, Voyage voyage-3 = 1024). */
const vector = (name: string, dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value: number[]) {
      return `[${value.join(",")}]`;
    },
  })(name);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * SAT credentials, encrypted at rest (AES-256-GCM sealed blobs).
 *  - kind="ciec":   encPassword set
 *  - kind="efirma": encCer + encKey + encKeyPassword set
 */
export const credentials = pgTable("credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  rfc: text("rfc").notNull(),
  kind: text("kind", { enum: ["ciec", "efirma"] }).notNull(),
  encPassword: text("enc_password"),
  encCer: text("enc_cer"),
  encKey: text("enc_key"),
  encKeyPassword: text("enc_key_password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Append-only event log: every requested/result event + agent action. 
 * works as a byproduct of the scraping process and can be used to debug and audit the process.
*/
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correlationId: text("correlation_id").notNull(),
    userId: uuid("user_id"),
    rfc: text("rfc"),
    name: text("name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "ok", "error"] })
      .default("pending")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCorrelation: index("events_correlation_idx").on(t.correlationId),
    byUserName: index("events_user_name_idx").on(t.userId, t.name, t.createdAt),
  }),
);

/** Vectorized documents (invoices, CSF, previews) for relational + RAG queries. */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    rfc: text("rfc").notNull(),
    type: text("type", {
      enum: [
        "invoice_emitted",
        "invoice_received",
        "csf",
        "invoice_preview",
        "invoice_issued",
      ],
    }).notNull(),
    sourceEventId: uuid("source_event_id"),
    title: text("title").notNull(),
    body: text("body").notNull(), // normalized, embedding-friendly text
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    embedding: vector("embedding", 1024),
    artifactId: uuid("artifact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byScope: index("documents_scope_idx").on(t.userId, t.rfc, t.type, t.createdAt),
  }),
);

/** Raw scraper output (HTML/PDF/screenshot), kept out of the hot query path. */
export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id"),
  correlationId: text("correlation_id"),
  kind: text("kind", { enum: ["html", "pdf", "png", "xml", "json"] }).notNull(),
  storageUrl: text("storage_url").notNull(),
  sha256: text("sha256"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DBUser = typeof users.$inferSelect;
export type DBCredential = typeof credentials.$inferSelect;
export type DBDocument = typeof documents.$inferSelect;
