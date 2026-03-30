import Bull from "bull";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { getRedisConfig } from "../config/redis";
import { DocumentJobData } from "../types/document";
import {
  QueueBulkJob,
  QueueHealth,
  QueueJob,
  QueueJobHandler,
  QueueLike
} from "../types/queue";

interface InMemoryJob<TData> {
  id: string;
  name: string;
  data: TData;
  attemptsMade: number;
  attempts: number;
  backoffDelayMs: number;
}

class InMemoryQueue<TData> extends EventEmitter {
  private waiting: Array<InMemoryJob<TData>> = [];
  private active = 0;
  private completed = 0;
  private failed = 0;
  private delayed = 0;
  private paused = false;
  private closing = false;
  private processor:
    | {
        name: string;
        concurrency: number;
        handler: QueueJobHandler<TData>;
      }
    | undefined;

  async addBulk(jobs: Array<QueueBulkJob<TData>>) {
    for (const job of jobs) {
      this.waiting.push({
        id: job.opts?.jobId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: job.name,
        data: job.data,
        attemptsMade: 0,
        attempts: job.opts?.attempts ?? env.JOB_ATTEMPTS,
        backoffDelayMs: job.opts?.backoff?.delay ?? env.JOB_BACKOFF_DELAY_MS
      });
    }

    this.dispatch();
  }

  async process(name: string, concurrency: number, handler: QueueJobHandler<TData>) {
    this.processor = {
      name,
      concurrency,
      handler
    };
    this.dispatch();
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
    this.dispatch();
  }

  async close() {
    this.closing = true;
    this.paused = true;
  }

  async waitForIdle(timeoutMs: number) {
    const startedAt = Date.now();

    while (this.active > 0 || this.waiting.length > 0 || this.delayed > 0) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`In-memory queue did not drain within ${timeoutMs} ms`);
      }

      await delay(100);
    }
  }

  getJobCounts() {
    return {
      waiting: this.waiting.length,
      active: this.active,
      completed: this.completed,
      failed: this.failed,
      delayed: this.delayed
    };
  }

  private dispatch() {
    if (this.paused || this.closing || !this.processor) {
      return;
    }

    while (this.active < this.processor.concurrency && this.waiting.length > 0) {
      const nextJob = this.waiting.shift();

      if (!nextJob || nextJob.name !== this.processor.name) {
        continue;
      }

      this.active += 1;
      const job: QueueJob<TData> = {
        id: nextJob.id,
        name: nextJob.name,
        data: nextJob.data,
        attemptsMade: nextJob.attemptsMade
      };

      this.emit("active", job);

      void this.processor
        .handler(job)
        .then((result) => {
          this.active -= 1;
          this.completed += 1;
          this.emit("completed", { ...job, attemptsMade: nextJob.attemptsMade + 1 }, result);
          this.dispatch();
        })
        .catch((error) => {
          this.active -= 1;
          nextJob.attemptsMade += 1;

          if (nextJob.attemptsMade < nextJob.attempts) {
            this.delayed += 1;
            const retryDelay = nextJob.backoffDelayMs * 2 ** Math.max(0, nextJob.attemptsMade - 1);

            void delay(retryDelay).then(() => {
              this.delayed -= 1;
              this.waiting.push(nextJob);
              this.dispatch();
            });
          } else {
            this.failed += 1;
            this.emit("failed", { ...job, attemptsMade: nextJob.attemptsMade }, error);
          }

          this.dispatch();
        });
    }
  }
}

class ResilientDocumentQueue extends EventEmitter implements QueueLike<DocumentJobData> {
  private backend: "bull" | "memory" = "bull";
  private readonly memoryQueue = new InMemoryQueue<DocumentJobData>();
  private bullQueue: Bull.Queue<DocumentJobData>;
  private redisStatus: QueueHealth["redis"] = {
    status: "up"
  };
  private primaryProcessor:
    | {
        name: string;
        concurrency: number;
        handler: QueueJobHandler<DocumentJobData>;
      }
    | undefined;
  private memoryFallbackProcessor:
    | {
        name: string;
        concurrency: number;
        handler: QueueJobHandler<DocumentJobData>;
      }
    | undefined;

  constructor() {
    super();

    this.bullQueue = this.createBullQueue();
    this.memoryQueue.on("active", (...args) => this.emit("active", ...args));
    this.memoryQueue.on("completed", (...args) => this.emit("completed", ...args));
    this.memoryQueue.on("failed", (...args) => this.emit("failed", ...args));
  }

  async addBulk(jobs: Array<QueueBulkJob<DocumentJobData>>): Promise<void> {
    if (await this.shouldUseMemoryFallback()) {
      await this.memoryQueue.addBulk(jobs);
      return;
    }

    try {
      await this.bullQueue.addBulk(jobs);
    } catch (error) {
      await this.activateMemoryFallback(error instanceof Error ? error.message : String(error));
      await this.memoryQueue.addBulk(jobs);
    }
  }

  async process<TResult = unknown>(
    name: string,
    concurrency: number,
    handler: QueueJobHandler<DocumentJobData, TResult>
  ): Promise<void> {
    this.primaryProcessor = {
      name,
      concurrency,
      handler
    };

    if (await this.shouldUseMemoryFallback()) {
      await this.memoryQueue.process(name, concurrency, handler);
      return;
    }

    this.bullQueue.process(name, concurrency, async (job) =>
      handler({
        id: String(job.id),
        name,
        data: job.data,
        attemptsMade: job.attemptsMade
      })
    );
  }

  registerMemoryFallbackProcessor<TResult = unknown>(
    name: string,
    concurrency: number,
    handler: QueueJobHandler<DocumentJobData, TResult>
  ) {
    this.memoryFallbackProcessor = {
      name,
      concurrency,
      handler
    };

    if (this.backend === "memory") {
      void this.memoryQueue.process(name, concurrency, handler);
    }
  }

  async getJobCounts() {
    if (await this.shouldUseMemoryFallback()) {
      return this.memoryQueue.getJobCounts();
    }

    try {
      const counts = await this.bullQueue.getJobCounts();

      return {
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed
      };
    } catch (error) {
      await this.activateMemoryFallback(error instanceof Error ? error.message : String(error));
      return this.memoryQueue.getJobCounts();
    }
  }

  async getHealth(): Promise<QueueHealth> {
    const counts = await this.getJobCounts();

    return {
      status: this.backend === "memory" ? "degraded" : "up",
      backend: this.backend,
      redis: this.redisStatus,
      queue: counts
    };
  }

  getBackend() {
    return this.backend;
  }

  async pause(): Promise<void> {
    if (this.backend === "memory") {
      await this.memoryQueue.pause();
      return;
    }

    await this.bullQueue.pause(true);
  }

  async resume(): Promise<void> {
    if (this.backend === "memory") {
      await this.memoryQueue.resume();
      return;
    }

    await this.bullQueue.resume(true);
  }

  async close(): Promise<void> {
    if (this.backend === "memory") {
      await this.memoryQueue.close();
      return;
    }

    await this.bullQueue.close();
  }

  async waitForIdle(timeoutMs: number): Promise<void> {
    if (this.backend === "memory") {
      await this.memoryQueue.waitForIdle(timeoutMs);
      return;
    }

    const startedAt = Date.now();

    while (true) {
      const counts = await this.bullQueue.getJobCounts();

      if (counts.active === 0) {
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Queue did not drain within ${timeoutMs} ms`);
      }

      await delay(100);
    }
  }

  private createBullQueue() {
    const queue = new Bull<DocumentJobData>(env.DOCUMENT_QUEUE_NAME, {
      redis: getRedisConfig(),
      defaultJobOptions: {
        attempts: env.JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: env.JOB_BACKOFF_DELAY_MS
        },
        removeOnComplete: 5000,
        removeOnFail: 5000
      }
    });

    queue.on("active", (job) => {
      this.emit("active", {
        id: String(job.id),
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade
      });
    });

    queue.on("completed", (job, result) => {
      this.emit(
        "completed",
        {
          id: String(job.id),
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade + 1
        },
        result
      );
    });

    queue.on("failed", (job, error) => {
      if (!job) {
        return;
      }

      this.emit(
        "failed",
        {
          id: String(job.id),
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade
        },
        error
      );
    });

    queue.on("error", (error) => {
      void this.activateMemoryFallback(error.message);
    });

    return queue;
  }

  private async shouldUseMemoryFallback() {
    if (this.backend === "memory") {
      return true;
    }

    try {
      await this.bullQueue.isReady();
      await this.bullQueue.getJobCounts();
      this.redisStatus = {
        status: "up"
      };
      return false;
    } catch (error) {
      await this.activateMemoryFallback(error instanceof Error ? error.message : String(error));
      return true;
    }
  }

  private async activateMemoryFallback(errorMessage: string) {
    if (this.backend === "memory") {
      return;
    }

    this.backend = "memory";
    this.redisStatus = {
      status: "down",
      error: errorMessage
    };

    logger.warn({ errorMessage }, "Redis unavailable, switching to in-memory queue fallback");

    const fallbackProcessor = this.memoryFallbackProcessor ?? this.primaryProcessor;

    if (fallbackProcessor) {
      await this.memoryQueue.process(
        fallbackProcessor.name,
        fallbackProcessor.concurrency,
        fallbackProcessor.handler
      );
    }

    try {
      await this.bullQueue.close();
    } catch {
      // Ignore close errors during fallback activation.
    }
  }
}

export const documentQueue = new ResilientDocumentQueue();
