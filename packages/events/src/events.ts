import { z } from "zod";
import type { SkillName } from "./skills.js";

/** Queue names (BullMQ). One queue per concern. */
export const QUEUES = {
  scrape: "scrape",
  embed: "embed",
} as const;

/** Job payload that flows through the `scrape` queue. */
export const scrapeJob = z.object({
  correlationId: z.string(),
  idempotencyKey: z.string(),
  userId: z.string(),
  credentialId: z.string(),
  rfc: z.string(),
  skill: z.string(), // SkillName
  input: z.record(z.unknown()),
});
export type ScrapeJob = z.infer<typeof scrapeJob> & { skill: SkillName };

/** Event names for the append-only event log + SSE UI stream. */
export const EVENT = {
  requested: (s: SkillName) => `scrape.${s}.requested` as const,
  succeeded: (s: SkillName) => `scrape.${s}.succeeded` as const,
  failed: (s: SkillName) => `scrape.${s}.failed` as const,
  previewed: "scrape.generateInvoice.previewed",
  agentAction: "agent.action",
} as const;

export type AgentAction = {
  kind: "thinking" | "tool_call" | "scraping" | "captcha" | "live_view" | "done";
  label: string;
  status: "started" | "ok" | "error";
  correlationId: string;
  liveViewUrl?: string;
};
