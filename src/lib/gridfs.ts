import { ObjectId, GridFSBucket, GridFSBucketWriteStream } from "mongodb";
import mongoose from "mongoose";
import { env } from "../config/env";

let bucket: GridFSBucket | null = null;

export function getGridFsBucket(): GridFSBucket {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection is not initialized");
  }

  if (!bucket) {
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: env.GRIDFS_BUCKET
    });
  }

  return bucket;
}

export function createPdfUploadStream(documentId: string): GridFSBucketWriteStream {
  return getGridFsBucket().openUploadStream(`${documentId}.pdf`, {
    contentType: "application/pdf",
    metadata: {
      documentId
    }
  });
}

export async function finalizeUploadStream(uploadStream: GridFSBucketWriteStream): Promise<ObjectId> {
  return new Promise<ObjectId>((resolve, reject) => {
    uploadStream.on("finish", () => resolve(uploadStream.id as ObjectId));
    uploadStream.on("error", reject);
  });
}

export async function abortUploadStream(uploadStream: GridFSBucketWriteStream): Promise<void> {
  try {
    await uploadStream.abort();
  } catch {
    // Ignore cleanup errors when aborting a partial GridFS upload.
  }
}
