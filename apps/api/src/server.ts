import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "@sat/shared";
import { skillsRoutes } from "./routes/skills.js";
import { streamRoutes } from "./routes/stream.js";
import { voiceRoutes } from "./routes/voice.js";
import { agentRoutes } from "./routes/agent.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: ["req.headers.authorization", "password", "*.password"], censor: "[redacted]" },
      ...(env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
  });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });

  app.get("/health", async () => ({ ok: true, driver: env.SAT_DRIVER }));

  await app.register(skillsRoutes);
  await app.register(streamRoutes);
  await app.register(voiceRoutes);
  await app.register(agentRoutes);

  return app;
}
