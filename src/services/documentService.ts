import { Types } from "mongoose";
import { assertMongoAvailable } from "../config/mongo";
import { DocumentModel } from "../models/Document";
import { AppError } from "../errors/AppError";
import { getGridFsBucket } from "../lib/gridfs";

export async function getDocumentStream(documentId: string) {
  assertMongoAvailable();

  if (!Types.ObjectId.isValid(documentId)) {
    throw new AppError(400, "Invalid documentId");
  }

  const document = await DocumentModel.findById(documentId).lean();

  if (!document) {
    throw new AppError(404, "Document not found");
  }

  if (document.status !== "completed" || !document.gridFsFileId) {
    throw new AppError(409, "Document is not ready yet");
  }

  const stream = getGridFsBucket().openDownloadStream(document.gridFsFileId);

  return {
    document,
    stream
  };
}
