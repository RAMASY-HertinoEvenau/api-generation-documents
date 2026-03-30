import { env } from "../config/env";
import { assertMongoAvailable } from "../config/mongo";
import { pdfWorkerPool } from "../lib/pdfWorkerPool";
import { DocumentModel } from "../models/Document";
import { DocumentJobData } from "../types/document";
import { simulateDocuSignCall } from "./docusignService";

interface ProcessDocumentResult {
  documentId: string;
  bytesWritten: number;
  renderDurationMs: number;
}

export async function processDocumentJob(jobData: DocumentJobData): Promise<ProcessDocumentResult> {
  const { batchId, documentId, userId, templateName } = jobData;

  assertMongoAvailable();

  await DocumentModel.updateOne(
    {
      _id: documentId
    },
    {
      $set: {
        status: "processing",
        errorMessage: null
      },
      $inc: {
        attempts: 1
      }
    }
  );

  await simulateDocuSignCall({
    batchId,
    documentId,
    userId
  });

  const renderResult = await pdfWorkerPool.renderToGridFs(
    {
      batchId,
      documentId,
      userId,
      templateName
    },
    {
      timeoutMs: env.PDF_RENDER_TIMEOUT_MS
    }
  );

  await DocumentModel.updateOne(
    {
      _id: documentId
    },
    {
      $set: {
        status: "completed",
        gridFsFileId: renderResult.gridFsFileId,
        generatedAt: new Date(),
        errorMessage: null,
        templateName: renderResult.templateName,
        fileSizeBytes: renderResult.bytesWritten,
        renderDurationMs: renderResult.renderDurationMs
      }
    }
  );

  return {
    documentId,
    bytesWritten: renderResult.bytesWritten,
    renderDurationMs: renderResult.renderDurationMs
  };
}
