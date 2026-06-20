/**
 * Small randomized pauses so our automation doesn't fire actions at machine
 * speed (instantaneous fills + clicks are an obvious bot signal, and the SAT
 * portal rate-limits/penalizes bursts). Use between discrete user-ish actions:
 * after a page is ready, between filling fields, before submitting, etc.
 *
 * Defaults are intentionally modest ("ligeramente más humano") — enough jitter
 * to break a perfectly periodic pattern without making flows noticeably slower.
 */
export function humanDelay(minMs = 350, maxMs = 1100): Promise<void> {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  const ms = lo + Math.floor(Math.random() * (hi - lo + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}
