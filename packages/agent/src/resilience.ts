import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude overload (HTTP 529) resilience. Anthropic outages are common, so:
 *   1. The SDK already retries 429/500/529 with exponential backoff (set a higher
 *      `maxRetries` on the client — see makeAnthropic()).
 *   2. If the primary model is *still* overloaded after retries, fall back to
 *      Sonnet, which draws from separate capacity.
 *   3. If even the fallback is down, the caller maps `isOverloaded(err)` → HTTP 503
 *      with a Retry-After so the voice/UI layer can degrade gracefully.
 */
export const PRIMARY_MODEL = "claude-opus-4-8";
export const FALLBACK_MODEL = "claude-sonnet-4-6";

/** Construct a client tuned for outages (more retries than the default 2). */
export function makeAnthropic(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 5 });
}

/** True for transient capacity errors worth a fallback / 503 (not 4xx logic errors). */
export function isOverloaded(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    return status === 529 || status === 503 || status === 500;
  }
  // Connection resets / timeouts during an outage.
  return err instanceof Anthropic.APIConnectionError;
}

/**
 * messages.create with automatic model fallback on overload. Pass the params you
 * want for the primary model; on a 529/5xx after SDK retries, it retries once on
 * FALLBACK_MODEL. Throws if both fail (caller checks isOverloaded → 503).
 */
export async function createMessageResilient(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  log?: { warn: (o: object, m: string) => void },
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(params);
  } catch (err) {
    if (isOverloaded(err) && params.model !== FALLBACK_MODEL) {
      log?.warn({ from: params.model, to: FALLBACK_MODEL }, "Claude overloaded — falling back");
      return await client.messages.create({ ...params, model: FALLBACK_MODEL });
    }
    throw err;
  }
}
