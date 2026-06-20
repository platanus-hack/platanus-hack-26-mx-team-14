import "./types.js";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { env } from "@sat/shared";
import { skillsRoutes } from "./routes/skills.js";
import { streamRoutes } from "./routes/stream.js";
import { voiceRoutes } from "./routes/voice.js";
import { agentRoutes } from "./routes/agent.js";
import { agentVoiceRoutes } from "./routes/agentVoice.js";
import { authRoutes } from "./routes/auth.js";
import { publicVoiceRoutes } from "./routes/publicVoice.js";
import { publicLlmRoutes } from "./routes/publicLlm.js";
import { mockRoutes } from "./routes/mock.js";

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
  const corsOrigin = env.WEB_ORIGIN?.replace(/\/+$/, "") || "http://localhost:3001";
  await app.register(cors, { origin: corsOrigin, credentials: true });
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });
  await app.register(fastifyMultipart, {
    limits: { fileSize: 1_000_000, files: 2 },
  });

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Token inválido o expirado" });
    }
  });

  app.get("/health", async () => ({ ok: true, driver: env.SAT_DRIVER }));

  await app.register(authRoutes);
  await app.register(publicVoiceRoutes);
  await app.register(publicLlmRoutes);
  await app.register(skillsRoutes);
  await app.register(streamRoutes);
  await app.register(voiceRoutes);
  await app.register(agentRoutes);
  await app.register(agentVoiceRoutes);
  await app.register(mockRoutes);

  return app;
}
