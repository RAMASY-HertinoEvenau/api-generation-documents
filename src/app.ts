import express from "express";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { getHealthController, getPrometheusMetricsController } from "./controllers/documentController";
import { logger } from "./config/logger";
import { apiRateLimiter } from "./middleware/rateLimit";
import { docsRouter } from "./routes/docsRoutes";
import { documentRouter } from "./routes/documentRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import { asyncHandler } from "./utils/asyncHandler";

export function createApp() {
  const app = express();

  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    req.requestId = req.header("x-request-id") || randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const requestId = req.requestId || randomUUID();
        req.requestId = requestId;
        return requestId;
      },
      customProps: (req) => ({
        requestId: req.requestId,
        batchId:
          typeof req.params?.batchId === "string"
            ? req.params.batchId
            : typeof req.body?.batchId === "string"
              ? req.body.batchId
              : undefined,
        documentId:
          typeof req.params?.documentId === "string"
            ? req.params.documentId
            : typeof req.body?.documentId === "string"
              ? req.body.documentId
              : undefined
      })
    })
  );

  app.get("/", (_req, res) => {
    res.json({
      message: "ProcessIQ Document Service",
      docs: "/docs",
      openapi: "/openapi.json",
      health: "/health",
      metrics: "/metrics"
    });
  });
  app.get("/health", asyncHandler(getHealthController));
  app.get("/metrics", asyncHandler(getPrometheusMetricsController));

  app.use(docsRouter);
  app.use("/api", apiRateLimiter, documentRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
