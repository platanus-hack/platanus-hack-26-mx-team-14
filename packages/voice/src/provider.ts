import type { SkillName } from "@sat/events";

/**
 * Provider-agnostic voice layer. Vapi and ElevenLabs both drive conversations and
 * invoke "functions/tools" over webhooks; we normalize that so the rest of the app
 * (the agent + skills) never depends on a specific vendor. Swapping providers is a
 * config change. See VOICE_PROVIDER in .env.
 */

/** A normalized tool/function invocation extracted from a provider webhook. */
export interface VoiceToolCall {
  id: string;
  skill: SkillName | string;
  args: Record<string, unknown>;
  /** Provider-specific session/call id for correlation. */
  callId: string;
}

/** What we send back to the provider after running the skill. */
export interface VoiceToolResult {
  id: string;
  /** Spoken summary + structured payload for UI. */
  speech: string;
  data?: unknown;
}

export interface VoiceWebhookParse {
  kind: "tool_call" | "transcript" | "status" | "ignored";
  toolCall?: VoiceToolCall;
  transcript?: { role: "user" | "assistant"; text: string; callId: string };
}

export interface VoiceProvider {
  readonly name: "vapi" | "elevenlabs";
  /** Verify the webhook signature/secret. */
  verify(headers: Record<string, string | undefined>, rawBody: string): boolean;
  /** Normalize an incoming webhook body. */
  parseWebhook(body: unknown): VoiceWebhookParse;
  /** Format a tool result into the provider's expected response shape. */
  formatToolResult(result: VoiceToolResult): unknown;
  /** The tool/function definitions to register on the provider's assistant. */
  toolManifest(): unknown;
}
