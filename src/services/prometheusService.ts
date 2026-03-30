import client from "prom-client";
import { documentQueue } from "../queues/documentQueue";

const registry = new client.Registry();

client.collectDefaultMetrics({
  register: registry,
  prefix: "processiq_"
});

const documentsGeneratedTotal = new client.Counter({
  name: "documents_generated_total",
  help: "Nombre total de documents traites par le service",
  labelNames: ["status", "queue_backend"] as const,
  registers: [registry]
});

const batchProcessingDurationSeconds = new client.Histogram({
  name: "batch_processing_duration_seconds",
  help: "Duree de traitement des batches en secondes",
  labelNames: ["status"] as const,
  buckets: [1, 5, 10, 20, 30, 45, 60, 90, 120, 300],
  registers: [registry]
});

const queueSize = new client.Gauge({
  name: "queue_size",
  help: "Taille de la file par etat",
  labelNames: ["state", "backend"] as const,
  registers: [registry]
});

const observedCompletedBatches = new Set<string>();

export function recordDocumentProcessed(status: "completed" | "failed", backend: "bull" | "memory") {
  documentsGeneratedTotal.inc({
    status,
    queue_backend: backend
  });
}

export function recordBatchProcessingDuration(batchId: string, status: "completed" | "failed", durationSeconds: number) {
  if (observedCompletedBatches.has(batchId)) {
    return;
  }

  observedCompletedBatches.add(batchId);
  batchProcessingDurationSeconds.observe(
    {
      status
    },
    durationSeconds
  );
}

export async function updateQueueSizeMetrics() {
  const counts = await documentQueue.getJobCounts();
  const backend = documentQueue.getBackend();

  queueSize.set({ state: "waiting", backend }, counts.waiting);
  queueSize.set({ state: "active", backend }, counts.active);
  queueSize.set({ state: "completed", backend }, counts.completed);
  queueSize.set({ state: "failed", backend }, counts.failed);
  queueSize.set({ state: "delayed", backend }, counts.delayed);
}

export async function getPrometheusMetrics() {
  await updateQueueSizeMetrics();
  return registry.metrics();
}

export function getPrometheusContentType() {
  return registry.contentType;
}
