import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/db.js";
import { validateEnvironment } from "./config/env.js";
import { log } from "./observability/logger.js";

const environment = validateEnvironment();
const server = app.listen(environment.PORT, () => log("info", "server_started", { port: environment.PORT, environment: environment.NODE_ENV }));
server.requestTimeout = environment.SERVER_REQUEST_TIMEOUT_MS;
server.headersTimeout = environment.SERVER_REQUEST_TIMEOUT_MS + 5_000;
server.keepAliveTimeout = 5_000;

server.on("error", (error) => { log("error", "server_error", { reason: error.message }); process.exitCode = 1; });

async function shutdown(signal: string): Promise<void> {
  log("info", "shutdown_started", { signal });
  server.close(async () => {
    await pool?.end();
    log("info", "shutdown_complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
