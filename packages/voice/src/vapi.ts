import { env } from "@sat/shared";
import { SKILL_NAMES } from "@sat/events";
import type {
  VoiceProvider,
  VoiceWebhookParse,
  VoiceToolResult,
} from "./provider.js";

/**
 * Vapi adapter. Vapi posts webhooks (`message.type`): "tool-calls" carry function
 * invocations; "transcript" carries speech; "status-update"/"end-of-call-report"
 * carry lifecycle. We map Vapi function calls → our skills 1:1 (same names).
 *
 * To go live later: create a Vapi assistant whose `tools` = toolManifest(), set its
 * server URL to POST /voice/vapi/webhook, and set VAPI_API_KEY / VAPI_WEBHOOK_SECRET.
 */
export class VapiProvider implements VoiceProvider {
  readonly name = "vapi" as const;

  verify(headers: Record<string, string | undefined>, _rawBody: string): boolean {
    const secret = env.VAPI_WEBHOOK_SECRET;
    if (!secret) return true; // dev: allow if unset
    // Vapi sends a shared secret header (configurable). Compare in constant-ish time.
    const got = headers["x-vapi-secret"] ?? headers["x-vapi-signature"];
    return got === secret;
  }

  parseWebhook(body: unknown): VoiceWebhookParse {
    const msg = (body as { message?: Record<string, unknown> })?.message;
    const type = msg?.type as string | undefined;
    const callId = ((msg?.call as { id?: string })?.id ?? "unknown") as string;

    if (type === "tool-calls" || type === "function-call") {
      // Vapi may send `toolCalls: [{ id, function: { name, arguments } }]`
      const calls = (msg?.toolCalls ?? msg?.toolCallList ?? []) as Array<{
        id: string;
        function?: { name: string; arguments: unknown };
      }>;
      const first = calls[0];
      if (first?.function) {
        const args =
          typeof first.function.arguments === "string"
            ? safeJson(first.function.arguments)
            : (first.function.arguments as Record<string, unknown>);
        return {
          kind: "tool_call",
          toolCall: { id: first.id, skill: first.function.name, args, callId },
        };
      }
    }

    if (type === "transcript") {
      return {
        kind: "transcript",
        transcript: {
          role: (msg?.role as "user" | "assistant") ?? "user",
          text: (msg?.transcript as string) ?? "",
          callId,
        },
      };
    }

    return { kind: type ? "status" : "ignored" };
  }

  formatToolResult(result: VoiceToolResult): unknown {
    // Vapi expects: { results: [{ toolCallId, result }] }
    return {
      results: [
        {
          toolCallId: result.id,
          result: result.speech,
          ...(result.data ? { metadata: result.data } : {}),
        },
      ],
    };
  }

  toolManifest(): unknown {
    // Minimal manifest; descriptions/params mirror @sat/agent tool schemas.
    return SKILL_NAMES.map((name) => ({
      type: "function",
      function: {
        name,
        description: `SAT skill: ${name}`,
        // Full JSON schema is owned by @sat/agent; reference it when wiring Vapi.
      },
    }));
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
