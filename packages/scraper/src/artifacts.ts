import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { env, uuid } from "@sat/shared";

/**
 * Stores raw scraper output (HTML/PDF/PNG/XML). Dev: local filesystem under
 * ARTIFACTS_DIR. Prod: swap for object storage (signed URLs). Always called —
 * even on failure — so flows are debuggable and replayable.
 */
export type ArtifactKind = "html" | "pdf" | "png" | "xml" | "json";

export interface StoredArtifact {
  id: string;
  kind: ArtifactKind;
  url: string; // file:// in dev, https signed in prod
  sha256: string;
}

export async function storeArtifact(
  kind: ArtifactKind,
  data: Buffer,
  meta: { correlationId: string; label?: string } = { correlationId: "—" },
): Promise<StoredArtifact> {
  const id = uuid();
  const sha256 = createHash("sha256").update(data).digest("hex");
  const dir = resolve(env.ARTIFACTS_DIR, meta.correlationId);
  await mkdir(dir, { recursive: true });
  const filename = `${meta.label ?? kind}-${id}.${kind}`;
  const path = join(dir, filename);
  await writeFile(path, data);
  return { id, kind, url: `file://${path}`, sha256 };
}
