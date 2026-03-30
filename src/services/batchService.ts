import { PipelineStage, Types } from "mongoose";
import { env } from "../config/env";
import { assertMongoAvailable } from "../config/mongo";
import { logger } from "../config/logger";
import { AppError } from "../errors/AppError";
import { BatchModel } from "../models/Batch";
import { DocumentModel } from "../models/Document";
import { documentQueue } from "../queues/documentQueue";
import { recordBatchProcessingDuration } from "./prometheusService";

export async function createBatch(userIds: string[]) {
  assertMongoAvailable();

  if (userIds.length === 0) {
    throw new AppError(400, "userIds must contain at least one item");
  }

  if (userIds.length > 1000) {
    throw new AppError(400, "The batch size cannot exceed 1000 documents");
  }

  const batch = await BatchModel.create({
    status: "pending",
    totalDocuments: userIds.length
  });

  const documents = userIds.map((userId) => ({
    _id: new Types.ObjectId(),
    batchId: batch._id,
    userId,
    status: "pending" as const,
    templateName: env.PDF_TEMPLATE_NAME
  }));

  try {
    await DocumentModel.insertMany(documents, {
      ordered: true
    });

    await documentQueue.addBulk(
      documents.map((document) => ({
        name: "generate-document",
        data: {
          batchId: batch._id.toString(),
          documentId: document._id.toString(),
          userId: document.userId,
          templateName: document.templateName
        },
        opts: {
          jobId: document._id.toString()
        }
      }))
    );
  } catch (error) {
    logger.error({ err: error, batchId: batch._id.toString() }, "Failed to enqueue batch");

    await Promise.allSettled([
      BatchModel.findByIdAndUpdate(batch._id, {
        status: "failed",
        failedDocuments: userIds.length,
        processedDocuments: userIds.length,
        lastError: error instanceof Error ? error.message : "Unknown queue error",
        completedAt: new Date()
      }),
      DocumentModel.updateMany(
        {
          batchId: batch._id
        },
        {
          $set: {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown queue error"
          }
        }
      )
    ]);

    throw new AppError(500, "Unable to create the batch");
  }

  return {
    batchId: batch._id.toString(),
    status: batch.status,
    totalDocuments: batch.totalDocuments
  };
}

export async function getBatchDetails(batchId: string) {
  assertMongoAvailable();

  if (!Types.ObjectId.isValid(batchId)) {
    throw new AppError(400, "Invalid batchId");
  }

  const batch = await BatchModel.findById(batchId).lean();

  if (!batch) {
    throw new AppError(404, "Batch not found");
  }

  const documents = await DocumentModel.find({
    batchId: batch._id
  })
    .sort({ createdAt: 1 })
    .lean();

  return {
    batchId: batch._id.toString(),
    status: batch.status,
    totalDocuments: batch.totalDocuments,
    processedDocuments: batch.processedDocuments,
    completedDocuments: batch.completedDocuments,
    failedDocuments: batch.failedDocuments,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    documents: documents.map((document) => ({
      documentId: document._id.toString(),
      userId: document.userId,
      status: document.status,
      attempts: document.attempts,
      templateName: document.templateName,
      errorMessage: document.errorMessage,
      generatedAt: document.generatedAt,
      fileSizeBytes: document.fileSizeBytes,
      renderDurationMs: document.renderDurationMs,
      downloadUrl:
        document.status === "completed" ? `/api/documents/${document._id.toString()}` : null
    }))
  };
}

export async function markBatchProcessing(batchId: string) {
  assertMongoAvailable();

  await BatchModel.updateOne(
    {
      _id: batchId,
      status: "pending"
    },
    {
      $set: {
        status: "processing",
        startedAt: new Date()
      }
    }
  );
}

export async function markBatchProgress(batchId: string, outcome: "completed" | "failed", error?: string) {
  assertMongoAvailable();

  const incrementCompleted = outcome === "completed" ? 1 : 0;
  const incrementFailed = outcome === "failed" ? 1 : 0;

  const updatePipeline: PipelineStage[] = [
    {
      $set: {
        processedDocuments: {
          $add: ["$processedDocuments", 1]
        },
        completedDocuments: {
          $add: ["$completedDocuments", incrementCompleted]
        },
        failedDocuments: {
          $add: ["$failedDocuments", incrementFailed]
        },
        lastError:
          outcome === "failed"
            ? {
                $ifNull: [error, "$lastError"]
              }
            : "$lastError",
        status: {
          $let: {
            vars: {
              nextProcessed: {
                $add: ["$processedDocuments", 1]
              },
              nextFailed: {
                $add: ["$failedDocuments", incrementFailed]
              }
            },
            in: {
              $cond: [
                {
                  $gte: ["$$nextProcessed", "$totalDocuments"]
                },
                {
                  $cond: [
                    {
                      $gt: ["$$nextFailed", 0]
                    },
                    "failed",
                    "completed"
                  ]
                },
                "processing"
              ]
            }
          }
        },
        completedAt: {
          $let: {
            vars: {
              nextProcessed: {
                $add: ["$processedDocuments", 1]
              }
            },
            in: {
              $cond: [
                {
                  $gte: ["$$nextProcessed", "$totalDocuments"]
                },
                "$$NOW",
                "$completedAt"
              ]
            }
          }
        }
      }
    }
  ];

  const updatedBatch = await BatchModel.findOneAndUpdate(
    {
      _id: batchId
    },
    updatePipeline,
    {
      new: true
    }
  ).lean();

  if (
    updatedBatch &&
    updatedBatch.processedDocuments === updatedBatch.totalDocuments &&
    updatedBatch.startedAt &&
    updatedBatch.completedAt
  ) {
    const durationSeconds =
      (updatedBatch.completedAt.getTime() - updatedBatch.startedAt.getTime()) / 1000;

    recordBatchProcessingDuration(
      updatedBatch._id.toString(),
      updatedBatch.status === "failed" ? "failed" : "completed",
      Math.max(durationSeconds, 0)
    );
  }
}
