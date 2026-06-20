import Anthropic from "@anthropic-ai/sdk";
import { env, childLogger } from "@sat/shared";

/**
 * Solve the SAT alphanumeric image captcha with Claude vision.
 * Only the captcha image crosses this boundary — never page HTML or credentials.
 */
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  // maxRetries: 5 → SDK auto-retries 429/500/529 with backoff (Claude outages are common).
  return (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 }));
}

export async function solveCaptcha(
  imagePng: Buffer,
  ctx: { correlationId: string } = { correlationId: "—" },
): Promise<string> {
  const log = childLogger({ correlationId: ctx.correlationId, op: "captcha" });
  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 64,
    system:
      "You read CAPTCHA images. The user sends a single image of an alphanumeric " +
      "captcha. Reply with ONLY the characters you see — no spaces, no punctuation, " +
      "no explanation. Preserve case if discernible.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imagePng.toString("base64"),
            },
          },
          { type: "text", text: "What are the characters in this captcha?" },
        ],
      },
    ],
  });

  const text = res.content.find((b) => b.type === "text");
  const solution = (text && "text" in text ? text.text : "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim();

  log.debug({ length: solution.length }, "captcha solved");
  if (!solution) throw new Error("Claude returned an empty captcha solution");
  return solution;
}
