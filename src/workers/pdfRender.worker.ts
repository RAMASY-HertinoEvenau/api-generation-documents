import { performance } from "node:perf_hooks";
import { parentPort } from "node:worker_threads";
import PDFDocument from "pdfkit";
import { renderPdfDocument } from "../services/pdfGenerator";
import { RenderPdfWorkerCommand, RenderPdfWorkerMessage } from "../types/pdfWorker";

if (!parentPort) {
  throw new Error("PDF render worker must run inside a worker thread");
}

function postMessage(message: RenderPdfWorkerMessage, transferList?: readonly ArrayBuffer[]) {
  parentPort!.postMessage(message, transferList ?? []);
}

async function render(command: RenderPdfWorkerCommand) {
  const { payload } = command;
  const startedAt = performance.now();

  try {
    const document = new PDFDocument({
      info: {
        Title: `Generated document ${payload.documentId}`,
        Author: "ProcessIQ Document Service"
      }
    });

    document.on("data", (chunk: Buffer) => {
      const transferableChunk = Uint8Array.from(chunk);
      postMessage(
        {
          type: "chunk",
          taskId: payload.taskId,
          chunk: transferableChunk
        },
        [transferableChunk.buffer]
      );
    });

    document.on("error", (error) => {
      postMessage({
        type: "failed",
        taskId: payload.taskId,
        errorMessage: error.message
      });
    });

    document.on("end", () => {
      postMessage({
        type: "completed",
        taskId: payload.taskId,
        durationMs: Math.round(performance.now() - startedAt),
        templateName: payload.templateName
      });
    });

    renderPdfDocument(document, payload);
    document.end();
  } catch (error) {
    postMessage({
      type: "failed",
      taskId: payload.taskId,
      errorMessage: error instanceof Error ? error.message : "Unknown PDF worker error"
    });
  }
}

parentPort.on("message", (command: RenderPdfWorkerCommand) => {
  if (command.type === "render") {
    void render(command);
  }
});

postMessage({ type: "ready" });
