import { InferSchemaType, Schema, model } from "mongoose";
import { BatchStatus } from "../types/document";

const batchSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"] satisfies BatchStatus[],
      default: "pending",
      index: true
    },
    totalDocuments: {
      type: Number,
      required: true
    },
    processedDocuments: {
      type: Number,
      default: 0
    },
    completedDocuments: {
      type: Number,
      default: 0
    },
    failedDocuments: {
      type: Number,
      default: 0
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    lastError: {
      type: String
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

batchSchema.index({ createdAt: -1 });

export type BatchDocument = InferSchemaType<typeof batchSchema> & { _id: string };

export const BatchModel = model("Batch", batchSchema);
