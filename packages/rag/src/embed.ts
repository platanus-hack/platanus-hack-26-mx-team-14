import { env } from "@sat/shared";

/**
 * Voyage embeddings (voyage-3, 1024-d) for the RAG client. We embed the
 * *normalized* document text (see @sat/events results), not raw HTML.
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_DIM = 1024;

export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document",
): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set");
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3", input: texts, input_type: inputType }),
  });
  if (!res.ok) throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  inputType: "document" | "query" = "query",
): Promise<number[]> {
  const [v] = await embed([text], inputType);
  if (!v) throw new Error("Voyage returned no embedding");
  return v;
}
