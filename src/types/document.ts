export type BatchStatus = "pending" | "processing" | "completed" | "failed";

export type DocumentStatus = "pending" | "processing" | "completed" | "failed";

export interface DocumentJobData {
  batchId: string;
  documentId: string;
  userId: string;
  templateName: string;
}
