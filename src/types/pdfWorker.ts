export interface RenderPdfTaskPayload {
  taskId: string;
  batchId: string;
  documentId: string;
  userId: string;
  templateName: string;
}

export type RenderPdfWorkerCommand = {
  type: "render";
  payload: RenderPdfTaskPayload;
};

export type RenderPdfWorkerMessage =
  | {
      type: "ready";
    }
  | {
      type: "chunk";
      taskId: string;
      chunk: Uint8Array;
    }
  | {
      type: "completed";
      taskId: string;
      durationMs: number;
      templateName: string;
    }
  | {
      type: "failed";
      taskId: string;
      errorMessage: string;
    };

export interface RenderToGridFsInput {
  batchId: string;
  documentId: string;
  userId: string;
  templateName: string;
}

export interface RenderToGridFsResult {
  gridFsFileId: string;
  bytesWritten: number;
  renderDurationMs: number;
  templateName: string;
}
