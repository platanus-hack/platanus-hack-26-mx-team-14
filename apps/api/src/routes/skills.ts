import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idempotencyKey, uuid } from "@sat/shared";
import { SKILL_NAMES, type ScrapeJob, type SkillName } from "@sat/events";
import { runSkillViaQueue } from "../queue.js";

const body = z.object({
  userId: z.string(),
  credentialId: z.string(),
  rfc: z.string(),
  input: z.record(z.unknown()).default({}),
});

export async function skillsRoutes(app: FastifyInstance) {
  app.post("/skills/:skill/run", async (req, reply) => {
    const skill = (req.params as { skill: string }).skill as SkillName;
    if (!SKILL_NAMES.includes(skill)) {
      return reply.code(404).send({ error: `unknown skill: ${skill}` });
    }
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues });

    const correlationId = uuid();
    const job: ScrapeJob = {
      skill,
      correlationId,
      idempotencyKey: idempotencyKey({ skill, ...parsed.data.input, c: correlationId }),
      userId: parsed.data.userId,
      credentialId: parsed.data.credentialId,
      rfc: parsed.data.rfc,
      input: parsed.data.input,
    };

    try {
      const result = await runSkillViaQueue(job);
      return reply.send({ correlationId, result });
    } catch (err) {
      req.log.error({ err }, "skill run failed");
      return reply.code(502).send({ correlationId, error: (err as Error).message });
    }
  });
}
