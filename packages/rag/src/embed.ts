import { env, logger } from "@sat/shared";

const log = logger.child({ mod: "rag.embed" });

/**
 * Voyage embeddings (voyage-3, 1024-d) for the RAG client. We embed the
 * *normalized* document text (see @sat/events results), not raw HTML.
 */
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_DIM = 1024;

// Voyage's free tier is rate-limited (3 RPM). Retry transient 429/5xx with
// backoff so a burst of agent calls doesn't fail a user-facing turn. Honors the
// Retry-After header when present; caps total wait so we never hang a request.
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document",
): Promise<number[][]> {
  if (!env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set");
  if (texts.length === 0) return [];

  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3", input: texts, input_type: inputType }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data: { embedding: number[] }[];
        usage?: { total_tokens?: number };
      };
      log.info(
        { inputs: texts.length, inputType, tokens: json.usage?.total_tokens, ms: Date.now() - t0, attempt },
        "voyage embed ok",
      );
      return json.data.map((d) => d.embedding);
    }

    lastErr = `${res.status} ${await res.text()}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      log.error({ status: res.status, attempt, inputs: texts.length, ms: Date.now() - t0 }, "voyage embed failed");
      break;
    }

    // Prefer the server's Retry-After (seconds); else exponential backoff (2s, 4s, 8s).
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Math.min(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** (attempt - 1), 15_000);
    log.warn({ status: res.status, attempt, waitMs }, "voyage embed retrying (rate-limited/5xx)");
    await sleep(waitMs);
  }
  throw new Error(`Voyage embed failed: ${lastErr}`);
}

export async function embedOne(
  text: string,
  inputType: "document" | "query" = "query",
): Promise<number[]> {
  const [v] = await embed([text], inputType);
  if (!v) throw new Error("Voyage returned no embedding");
  return v;
}
