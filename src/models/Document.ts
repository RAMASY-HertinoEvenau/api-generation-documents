import { InferSchemaType, Schema, Types, model } from "mongoose";
import { DocumentStatus } from "../types/document";

const documentSchema = new Schema(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"] satisfies DocumentStatus[],
      default: "pending",
      index: true
    },
    gridFsFileId: {
      type: Schema.Types.ObjectId
    },
    attempts: {
      type: Number,
      default: 0
    },
    generatedAt: {
      type: Date
    },
    errorMessage: {
      type: String
    },
    mimeType: {
      type: String,
      default: "application/pdf"
    },
    templateName: {
      type: String,
      default: "cerfa"
    },
    fileSizeBytes: {
      type: Number
    },
    renderDurationMs: {
      type: Number
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

documentSchema.index({ batchId: 1, status: 1 });

export type DocumentModelType = InferSchemaType<typeof documentSchema> & {
  _id: Types.ObjectId;
};

export const DocumentModel = model("Document", documentSchema);
