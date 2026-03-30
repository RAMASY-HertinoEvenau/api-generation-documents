import { env } from "../config/env";
import { logger } from "../config/logger";
import { DocumentModel } from "../models/Document";
import { documentQueue } from "../queues/documentQueue";
import { DocumentJobData } from "../types/document";
import { markBatchProcessing, markBatchProgress } from "./batchService";
import { processDocumentJob } from "./documentProcessor";
import { recordDocumentProcessed } from "./prometheusService";

let eventHandlersAttached = false;

export async function registerDocumentWorker(runtimeLabel: string) {
  attachDocumentQueueEventHandlers();
  await documentQueue.process("generate-document", env.DOCUMENT_CONCURRENCY, async (job) => {
    await markBatchProcessing(job.data.batchId);
    return processDocumentJob(job.data);
  });

  logger.info(
    {
      runtimeLabel,
      concurrency: env.DOCUMENT_CONCURRENCY,
      queueBackend: documentQueue.getBackend()
    },
    "Document worker processor registered"
  );
}

export function registerMemoryFallbackWorker(runtimeLabel: string) {
  attachDocumentQueueEventHandlers();
  documentQueue.registerMemoryFallbackProcessor("generate-document", env.DOCUMENT_CONCURRENCY, async (job) => {
    await markBatchProcessing(job.data.batchId);
    return processDocumentJob(job.data);
  });

  logger.info({ runtimeLabel }, "Memory fallback processor registered");
}

function attachDocumentQueueEventHandlers() {
  if (eventHandlersAttached) {
    return;
  }

  eventHandlersAttached = true;

  documentQueue.on("active", (job) => {
    const queueJob = job as { id: string; data: DocumentJobData };
    logger.info(
      {
        jobId: queueJob.id,
        batchId: queueJob.data.batchId,
        documentId: queueJob.data.documentId
      },
      "Document generation started"
    );
  });

  documentQueue.on("completed", async (job, result) => {
    const queueJob = job as { id: string; data: DocumentJobData };
    const completion = result as { renderDurationMs?: number; bytesWritten?: number } | undefined;

    logger.info(
      {
        jobId: queueJob.id,
        batchId: queueJob.data.batchId,
        documentId: queueJob.data.documentId,
        renderDurationMs: completion?.renderDurationMs,
        bytesWritten: completion?.bytesWritten
      },
      "Document generation completed"
    );

    recordDocumentProcessed("completed", documentQueue.getBackend());
    await markBatchProgress(queueJob.data.batchId, "completed");
  });

  documentQueue.on("failed", async (job, error) => {
    const queueJob = job as { id: string; data: DocumentJobData; attemptsMade: number };
    const failure = error instanceof Error ? error : new Error(String(error));

    logger.error(
      {
        err: failure,
        jobId: queueJob.id,
        batchId: queueJob.data.batchId,
        documentId: queueJob.data.documentId,
        attemptsMade: queueJob.attemptsMade
      },
      "Document generation failed"
    );

    if (queueJob.attemptsMade < env.JOB_ATTEMPTS) {
      return;
    }

    recordDocumentProcessed("failed", documentQueue.getBackend());
    await DocumentModel.updateOne(
      {
        _id: queueJob.data.documentId
      },
      {
        $set: {
          status: "failed",
          errorMessage: failure.message
        }
      }
    );

    await markBatchProgress(queueJob.data.batchId, "failed", failure.message);
  });
}
