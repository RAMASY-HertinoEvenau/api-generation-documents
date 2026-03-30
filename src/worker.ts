import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectToMongo, disconnectFromMongo, startMongoReconnectLoop } from "./config/mongo";
import { pdfWorkerPool } from "./lib/pdfWorkerPool";
import { documentQueue } from "./queues/documentQueue";
import { registerDocumentWorker } from "./services/documentQueueRuntime";

async function bootstrapWorker() {
  await connectToMongo();
  startMongoReconnectLoop("worker");
  await pdfWorkerPool.waitUntilReady();

  await registerDocumentWorker("worker");

  logger.info(
    {
      concurrency: env.DOCUMENT_CONCURRENCY,
      queue: env.DOCUMENT_QUEUE_NAME,
      pdfWorkerThreads: env.PDF_WORKER_THREADS,
      templateName: env.PDF_TEMPLATE_NAME
    },
    "Worker is ready"
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down worker");
    try {
      await documentQueue.pause();
      await documentQueue.waitForIdle(env.SHUTDOWN_GRACE_PERIOD_MS);
      await pdfWorkerPool.waitForIdle(env.SHUTDOWN_GRACE_PERIOD_MS);
    } catch (error) {
      logger.warn({ err: error }, "Worker shutdown grace period reached before all jobs were drained");
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

void bootstrapWorker().catch((error) => {
  logger.error({ err: error }, "Failed to start worker");
  process.exit(1);
});

