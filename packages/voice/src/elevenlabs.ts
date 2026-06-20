import { SKILL_NAMES } from "@sat/events";
import type { VoiceProvider, VoiceWebhookParse, VoiceToolResult } from "./provider.js";

/**
 * ElevenLabs Conversational AI adapter (stub). Same contract as Vapi so the API
 * route is provider-agnostic. Flesh out parseWebhook/formatToolResult against the
 * ElevenLabs agent webhook shape when we wire it.
 */
export class ElevenLabsProvider implements VoiceProvider {
  readonly name = "elevenlabs" as const;
  verify(): boolean {
    return true;
  }
  parseWebhook(_body: unknown): VoiceWebhookParse {
    return { kind: "ignored" };
  }
  formatToolResult(result: VoiceToolResult): unknown {
    return { tool_call_id: result.id, output: result.speech };
  }
  toolManifest(): unknown {
    return SKILL_NAMES.map((name) => ({ name, description: `SAT skill: ${name}` }));
  }
}
