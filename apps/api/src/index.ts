import { env, logger } from "@sat/shared";
import { buildServer } from "./server.js";

const app = await buildServer();
app
  .listen({ port: env.apiPort, host: env.HOST })
  .then((addr) => logger.info(`API listening on ${addr}`))
  .catch((err) => {
    logger.error(err, "API failed to start");
    process.exit(1);
  });
