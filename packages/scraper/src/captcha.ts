import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { env, childLogger } from "@sat/shared";

/**
 * SAT alphanumeric captcha solver. Strategy (high accuracy on noisy captchas):
 *   1. Use the ORIGINAL image bytes (extracted from the data: URI), not a screenshot.
 *   2. Generate several preprocessed variants (upscale, grayscale, contrast).
 *   3. Read each variant with Claude vision under a constrained charset prompt.
 *   4. Majority vote across reads; normalize to uppercase A-Z/0-9.
 * Only the captcha image crosses this boundary — never page HTML or credentials.
 */
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return (_client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 5 }));
}

const SYSTEM =
  "Eres un transcriptor de CAPTCHAs del SAT (México). La imagen contiene 5 o 6 " +
  "caracteres: SOLO letras MAYÚSCULAS (A-Z) y dígitos (0-9), sin espacios. Ignora " +
  "las líneas/tachados que cruzan los caracteres y el ruido de fondo. Responde " +
  "ÚNICAMENTE con los caracteres, sin explicación, sin puntuación.";

/** Build diverse preprocessed views of the captcha to vote across. */
async function variants(img: Buffer): Promise<Buffer[]> {
  const out: Buffer[] = [];
  const W = 540; // upscale (~3x) for legibility
  const tries: Array<() => Promise<Buffer>> = [
    () => sharp(img).resize({ width: W }).png().toBuffer(),
    () => sharp(img).resize({ width: W }).grayscale().normalise().sharpen().png().toBuffer(),
    () => sharp(img).resize({ width: W }).grayscale().linear(1.6, -40).png().toBuffer(),
  ];
  for (const t of tries) {
    try {
      out.push(await t());
    } catch {
      // skip a failed variant
    }
  }
  if (out.length === 0) out.push(img); // fall back to raw bytes
  return out;
}

async function readOne(png: Buffer): Promise<string> {
  const res = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 24,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
          },
          { type: "text", text: "¿Qué caracteres ves en este captcha?" },
        ],
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return (block && "text" in block ? block.text : "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export async function solveCaptcha(
  image: Buffer,
  ctx: { correlationId: string } = { correlationId: "—" },
): Promise<string> {
  const log = childLogger({ correlationId: ctx.correlationId, op: "captcha" });

  const views = await variants(image);
  const reads = (await Promise.all(views.map((v) => readOne(v).catch(() => "")))).filter(
    (r) => r.length >= 4 && r.length <= 8,
  );

  if (reads.length === 0) throw new Error("captcha: every read was empty/invalid");

  // Majority vote
  const tally = new Map<string, number>();
  for (const r of reads) tally.set(r, (tally.get(r) ?? 0) + 1);
  const [best] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const solution = best?.[0] ?? reads[0]!;

  log.debug({ reads, solution, votes: best?.[1] }, "captcha solved (voted)");
  return solution;
}
