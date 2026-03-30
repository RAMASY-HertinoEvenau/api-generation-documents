import { RequestHandler } from "express";
import { createBatch, getBatchDetails } from "../services/batchService";
import { getDocumentStream } from "../services/documentService";
import { getHealthSnapshot } from "../services/healthService";
import { getMetrics } from "../services/metricsService";
import { getPrometheusContentType, getPrometheusMetrics } from "../services/prometheusService";
import { createBatchSchema } from "../validators/documentValidators";

export const createBatchController: RequestHandler = async (req, res) => {
  const payload = createBatchSchema.parse(req.body);
  const result = await createBatch(payload.userIds);
  req.log.info(
    {
      requestId: req.requestId,
      batchId: result.batchId,
      totalDocuments: result.totalDocuments
    },
    "Batch created"
  );

  res.status(202).json(result);
};

export const getBatchController: RequestHandler = async (req, res) => {
  const result = await getBatchDetails(String(req.params.batchId));
  req.log.info(
    {
      requestId: req.requestId,
      batchId: result.batchId,
      status: result.status
    },
    "Batch fetched"
  );
  res.json(result);
};

export const getDocumentController: RequestHandler = async (req, res) => {
  const { document, stream } = await getDocumentStream(String(req.params.documentId));
  req.log.info(
    {
      requestId: req.requestId,
      documentId: document._id.toString(),
      batchId: document.batchId?.toString?.()
    },
    "Document download started"
  );

  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${document._id.toString()}.pdf"`);

  stream.on("error", (error) => {
    res.destroy(error);
  });

  stream.pipe(res);
};

export const getMetricsController: RequestHandler = async (_req, res) => {
  const metrics = await getMetrics();
  res.json(metrics);
};

export const getHealthController: RequestHandler = async (_req, res) => {
  const health = await getHealthSnapshot();
  res.status(health.status === "down" ? 503 : 200).json(health);
};

export const getPrometheusMetricsController: RequestHandler = async (_req, res) => {
  res.setHeader("Content-Type", getPrometheusContentType());
  res.send(await getPrometheusMetrics());
};
