import { loadEnv } from "./env.js";
import { buildApp } from "./app.js";

loadEnv();

const app = buildApp();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ host, port });
app.log.info(`Server listening on http://${host}:${port}`);

const close = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void close("SIGINT"));
process.on("SIGTERM", () => void close("SIGTERM"));
