import type { FastifyInstance } from "fastify";
import IORedis from "ioredis";
import { env } from "@sat/shared";
import { actionChannel } from "../queue.js";

export async function streamRoutes(app: FastifyInstance) {
  app.get("/stream/:correlationId", async (req, reply) => {
    const { correlationId } = req.params as { correlationId: string };

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": env.WEB_ORIGIN,
    });
    reply.raw.write(`event: open\ndata: {"correlationId":"${correlationId}"}\n\n`);

    const sub = new IORedis({ ...env.redis, maxRetriesPerRequest: null });
    await sub.subscribe(actionChannel(correlationId));
    sub.on("message", (_chan, message) => {
      reply.raw.write(`event: action\ndata: ${message}\n\n`);
    });

    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 15000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      sub.disconnect();
    });
  });
}
