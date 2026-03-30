import { Router } from "express";
import {
  createBatchController,
  getBatchController,
  getDocumentController,
  getHealthController,
  getMetricsController
} from "../controllers/documentController";
import { batchRateLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../utils/asyncHandler";

export const documentRouter = Router();

documentRouter.get("/health", asyncHandler(getHealthController));
documentRouter.post("/documents/batch", batchRateLimiter, asyncHandler(createBatchController));
documentRouter.get("/documents/batch/:batchId", asyncHandler(getBatchController));
documentRouter.get("/documents/:documentId", asyncHandler(getDocumentController));
documentRouter.get("/metrics", asyncHandler(getMetricsController));
