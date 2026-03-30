import { cpus } from "node:os";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  RUN_EMBEDDED_WORKER: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  MONGODB_RECONNECT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  REDIS_URL: z.string().optional().transform((value) => value || undefined),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().transform((value) => value || undefined),
  DOCUMENT_QUEUE_NAME: z.string().min(1).default("document-generation"),
  DOCUMENT_CONCURRENCY: z.coerce.number().int().positive().default(25),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  JOB_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(1000),
  GRIDFS_BUCKET: z.string().min(1).default("generated-documents"),
  PDF_TEMPLATE_NAME: z.string().min(1).default("cerfa"),
  PDF_WORKER_THREADS: z.coerce.number().int().positive().default(Math.max(1, Math.min(cpus().length, 4))),
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DOCUSIGN_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  DOCUSIGN_RESET_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DOCUSIGN_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  DOCUSIGN_SIMULATED_LATENCY_MS: z.coerce.number().int().positive().default(150),
  DOCUSIGN_SIMULATED_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  BATCH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().positive().default(15000),
  BENCHMARK_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
