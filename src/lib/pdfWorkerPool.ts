import { cpus } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { GridFSBucketWriteStream, ObjectId } from "mongodb";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { abortUploadStream, createPdfUploadStream, finalizeUploadStream } from "./gridfs";
import {
  RenderPdfWorkerCommand,
  RenderPdfWorkerMessage,
  RenderToGridFsInput,
  RenderToGridFsResult
} from "../types/pdfWorker";

interface PendingRenderTask {
  id: string;
  input: RenderToGridFsInput;
  uploadStream: GridFSBucketWriteStream;
  finishPromise: Promise<ObjectId>;
  writeChain: Promise<void>;
  bytesWritten: number;
  settled: boolean;
  timeoutMs?: number;
  timeoutHandle?: NodeJS.Timeout;
  resolve: (result: RenderToGridFsResult) => void;
  reject: (error: Error) => void;
}

interface WorkerSlot {
  index: number;
  worker: Worker;
  ready: boolean;
  busy: boolean;
  currentTask: PendingRenderTask | null;
}

function resolveWorkerFilePath() {
  const extension = path.extname(__filename);
  return path.resolve(__dirname, "..", "workers", `pdfRender.worker${extension}`);
}

function getPoolSize() {
  return Math.max(1, Math.min(env.PDF_WORKER_THREADS, cpus().length));
}

export class PdfWorkerPool {
  private readonly slots = new Map<number, WorkerSlot>();
  private readonly waitingTasks: PendingRenderTask[] = [];
  private taskSequence = 0;
  private closing = false;
  private readonly workerFilePath = resolveWorkerFilePath();

  constructor(private readonly size: number) {
    for (let index = 0; index < size; index += 1) {
      this.createWorker(index);
    }
  }

  async waitUntilReady(): Promise<void> {
    while ([...this.slots.values()].some((slot) => !slot.ready)) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async renderToGridFs(
    input: RenderToGridFsInput,
    options?: {
      timeoutMs?: number;
    }
  ): Promise<RenderToGridFsResult> {
    if (this.closing) {
      throw new Error("PDF worker pool is shutting down");
    }

    const uploadStream = createPdfUploadStream(input.documentId);
    const finishPromise = finalizeUploadStream(uploadStream);

    return new Promise<RenderToGridFsResult>((resolve, reject) => {
      const task: PendingRenderTask = {
        id: `render-${++this.taskSequence}`,
        input,
        uploadStream,
        finishPromise,
        writeChain: Promise.resolve(),
        bytesWritten: 0,
        settled: false,
        timeoutMs: options?.timeoutMs,
        resolve,
        reject
      };

      this.waitingTasks.push(task);
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closing = true;

    while (this.waitingTasks.length > 0) {
      const task = this.waitingTasks.shift();
      if (task && !task.settled) {
        task.settled = true;
        task.reject(new Error("PDF worker pool closed before task execution"));
      }
    }

    await Promise.all(
      [...this.slots.values()].map(async (slot) => {
        if (slot.currentTask && !slot.currentTask.settled) {
          await this.failTask(slot, slot.currentTask, new Error("PDF worker terminated during shutdown"));
        }
        await slot.worker.terminate();
      })
    );
  }

  async waitForIdle(timeoutMs: number): Promise<void> {
    const startedAt = Date.now();

    while (this.waitingTasks.length > 0 || [...this.slots.values()].some((slot) => slot.busy)) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`PDF worker pool did not drain within ${timeoutMs} ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private createWorker(index: number) {
    const worker = new Worker(this.workerFilePath, {
      execArgv: process.execArgv
    });

    const slot = this.slots.get(index) ?? {
      index,
      worker,
      ready: false,
      busy: false,
      currentTask: null
    };

    slot.worker = worker;
    slot.ready = false;
    slot.busy = false;
    slot.currentTask = null;
    this.slots.set(index, slot);

    worker.on("message", (message: RenderPdfWorkerMessage) => {
      if (slot.worker !== worker) {
        return;
      }

      void this.handleMessage(slot, message);
    });

    worker.on("error", (error) => {
      if (slot.worker !== worker) {
        return;
      }

      void this.handleWorkerFailure(slot, worker, error);
    });

    worker.on("exit", (code) => {
      if (slot.worker !== worker) {
        return;
      }

      if (!this.closing && code !== 0) {
        void this.handleWorkerFailure(slot, worker, new Error(`PDF worker exited with code ${code}`));
      }
    });
  }

  private async handleMessage(slot: WorkerSlot, message: RenderPdfWorkerMessage) {
    if (message.type === "ready") {
      slot.ready = true;
      logger.info({ workerThreadIndex: slot.index }, "PDF worker thread ready");
      this.dispatch();
      return;
    }

    const task = slot.currentTask;
    if (!task) {
      return;
    }

    if (message.type === "chunk") {
      task.writeChain = task.writeChain
        .then(async () => {
          if (task.settled) {
            return;
          }

          const chunkBuffer = Buffer.from(message.chunk);
          task.bytesWritten += chunkBuffer.byteLength;
          await this.writeChunk(task.uploadStream, chunkBuffer);
        })
        .catch(async (error) => {
          if (!task.settled) {
            await this.failTask(slot, task, error instanceof Error ? error : new Error(String(error)));
          }
        });
      return;
    }

    if (message.type === "completed") {
      await this.completeTask(slot, task, message);
      return;
    }

    if (message.type === "failed") {
      await this.failTask(slot, task, new Error(message.errorMessage));
    }
  }

  private dispatch() {
    if (this.closing) {
      return;
    }

    for (const slot of this.slots.values()) {
      if (!slot.ready || slot.busy) {
        continue;
      }

      const nextTask = this.waitingTasks.shift();
      if (!nextTask) {
        return;
      }

      slot.busy = true;
      slot.currentTask = nextTask;

      if (nextTask.timeoutMs) {
        nextTask.timeoutHandle = setTimeout(() => {
          if (slot.currentTask?.id !== nextTask.id) {
            return;
          }

          void this.handleWorkerFailure(
            slot,
            slot.worker,
            new Error(`PDF rendering timed out after ${nextTask.timeoutMs} ms`)
          );
        }, nextTask.timeoutMs);
      }

      const command: RenderPdfWorkerCommand = {
        type: "render",
        payload: {
          taskId: nextTask.id,
          batchId: nextTask.input.batchId,
          documentId: nextTask.input.documentId,
          userId: nextTask.input.userId,
          templateName: nextTask.input.templateName
        }
      };

      slot.worker.postMessage(command);
    }
  }

  private async completeTask(
    slot: WorkerSlot,
    task: PendingRenderTask,
    message: Extract<RenderPdfWorkerMessage, { type: "completed" }>
  ) {
    if (task.settled) {
      return;
    }

    try {
      this.clearTaskTimeout(task);
      await task.writeChain;
      task.uploadStream.end();
      const gridFsFileId = await task.finishPromise;

      task.settled = true;
      task.resolve({
        gridFsFileId: gridFsFileId.toString(),
        bytesWritten: task.bytesWritten,
        renderDurationMs: message.durationMs,
        templateName: message.templateName
      });
      this.releaseSlot(slot);
    } catch (error) {
      await this.failTask(slot, task, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async failTask(slot: WorkerSlot, task: PendingRenderTask, error: Error) {
    if (task.settled) {
      return;
    }

    task.settled = true;
    this.clearTaskTimeout(task);
    await abortUploadStream(task.uploadStream);
    task.reject(error);
    this.releaseSlot(slot);
  }

  private async handleWorkerFailure(slot: WorkerSlot, worker: Worker, error: Error) {
    logger.error({ err: error, workerThreadIndex: slot.index }, "PDF worker thread failure");

    if (slot.currentTask && !slot.currentTask.settled) {
      await this.failTask(slot, slot.currentTask, error);
    }

    if (this.closing) {
      return;
    }

    try {
      await worker.terminate();
    } catch {
      // Ignore termination errors during recovery.
    }

    this.createWorker(slot.index);
  }

  private releaseSlot(slot: WorkerSlot) {
    slot.busy = false;
    slot.currentTask = null;
    this.dispatch();
  }

  private clearTaskTimeout(task: PendingRenderTask) {
    if (!task.timeoutHandle) {
      return;
    }

    clearTimeout(task.timeoutHandle);
    task.timeoutHandle = undefined;
  }

  private async writeChunk(uploadStream: GridFSBucketWriteStream, chunk: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      uploadStream.write(chunk, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

export const pdfWorkerPool = new PdfWorkerPool(getPoolSize());
