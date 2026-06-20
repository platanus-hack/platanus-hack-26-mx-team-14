import { env } from "@sat/shared";
import type { VoiceProvider } from "./provider.js";
import { VapiProvider } from "./vapi.js";
import { ElevenLabsProvider } from "./elevenlabs.js";

export * from "./provider.js";
export { VapiProvider } from "./vapi.js";
export { ElevenLabsProvider } from "./elevenlabs.js";

export function makeVoiceProvider(name = env.VOICE_PROVIDER): VoiceProvider {
  return name === "elevenlabs" ? new ElevenLabsProvider() : new VapiProvider();
}
