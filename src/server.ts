import { createServer } from "node:http";
import { env } from "./config/env";
import { connectToMongo, disconnectFromMongo, startMongoReconnectLoop } from "./config/mongo";
import { logger } from "./config/logger";
import { createApp } from "./app";
import { pdfWorkerPool } from "./lib/pdfWorkerPool";
import { documentQueue } from "./queues/documentQueue";
import { registerDocumentWorker, registerMemoryFallbackWorker } from "./services/documentQueueRuntime";

async function bootstrap() {
  await connectToMongo();
  startMongoReconnectLoop("api");
  registerMemoryFallbackWorker("api");

  if (env.RUN_EMBEDDED_WORKER) {
    await pdfWorkerPool.waitUntilReady();
    await registerDocumentWorker("api-embedded-worker");
    logger.info(
      {
        concurrency: env.DOCUMENT_CONCURRENCY,
        queue: env.DOCUMENT_QUEUE_NAME,
        pdfWorkerThreads: env.PDF_WORKER_THREADS
      },
      "Embedded worker enabled in API process"
    );
  }

  const app = createApp();
  const server = createServer(app);
  let shuttingDown = false;

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API server listening");
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Shutting down API server");
    server.close(() => {
      logger.info("HTTP server stopped accepting new requests");
    });

    try {
      await documentQueue.pause();
      await documentQueue.waitForIdle(env.SHUTDOWN_GRACE_PERIOD_MS);
      await pdfWorkerPool.waitForIdle(env.SHUTDOWN_GRACE_PERIOD_MS);
    } catch (error) {
      logger.warn({ err: error }, "API shutdown grace period reached before all jobs were drained");
    } finally {
      await documentQueue.close();
      await pdfWorkerPool.close();
      await disconnectFromMongo();
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start API server");
  process.exit(1);
});
