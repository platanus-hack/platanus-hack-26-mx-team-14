import { mockSkillResult, type SkillName, type SkillResult } from "@sat/events";

/**
 * Demo fixtures for the public voice agent. Delegates to the canonical dataset
 * in @sat/events (single source of truth shared with the web app), so voice and
 * text render identical data. generateInvoice always previews (never emits).
 */
export function fixtureFor(skill: SkillName, input: Record<string, unknown> = {}): SkillResult {
  return mockSkillResult(skill, input);
}
