import { documentQueue } from "../queues/documentQueue";
import { env } from "../config/env";
import { getDocuSignCircuitBreakerState } from "./docusignService";
import { updateQueueSizeMetrics } from "./prometheusService";

export async function getMetrics() {
  await updateQueueSizeMetrics();
  const counts = await documentQueue.getJobCounts();

  return {
    queueName: env.DOCUMENT_QUEUE_NAME,
    concurrency: env.DOCUMENT_CONCURRENCY,
    retryAttempts: env.JOB_ATTEMPTS,
    backoffDelayMs: env.JOB_BACKOFF_DELAY_MS,
    pdfTemplateName: env.PDF_TEMPLATE_NAME,
    pdfWorkerThreads: env.PDF_WORKER_THREADS,
    pdfRenderTimeoutMs: env.PDF_RENDER_TIMEOUT_MS,
    queueBackend: documentQueue.getBackend(),
    docusignCircuitBreaker: getDocuSignCircuitBreakerState(),
    jobs: counts
  };
}
