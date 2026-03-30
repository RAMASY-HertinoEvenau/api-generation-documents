export interface QueueJob<TData> {
  id: string;
  name: string;
  data: TData;
  attemptsMade: number;
}

export interface QueueBulkJob<TData> {
  name: string;
  data: TData;
  opts?: {
    jobId?: string;
    attempts?: number;
    backoff?: {
      type: "exponential";
      delay: number;
    };
  };
}

export interface QueueJobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueHealth {
  status: "up" | "degraded" | "down";
  backend: "bull" | "memory";
  redis: {
    status: "up" | "down";
    error?: string;
  };
  queue: QueueJobCounts;
}

export type QueueJobHandler<TData, TResult = unknown> = (
  job: QueueJob<TData>
) => Promise<TResult>;

export interface QueueLike<TData> {
  addBulk(jobs: Array<QueueBulkJob<TData>>): Promise<void>;
  process<TResult = unknown>(
    name: string,
    concurrency: number,
    handler: QueueJobHandler<TData, TResult>
  ): Promise<void>;
  registerMemoryFallbackProcessor<TResult = unknown>(
    name: string,
    concurrency: number,
    handler: QueueJobHandler<TData, TResult>
  ): void;
  getJobCounts(): Promise<QueueJobCounts>;
  getHealth(): Promise<QueueHealth>;
  getBackend(): "bull" | "memory";
  pause(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  waitForIdle(timeoutMs: number): Promise<void>;
  on(
    event: "active" | "completed" | "failed",
    listener: (...args: unknown[]) => void | Promise<void>
  ): this;
}
