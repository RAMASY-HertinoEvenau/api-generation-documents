import { NextFunction, Request, Response, Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "../docs/openapi";

export const docsRouter = Router();

function getServerUrl(protocol: string, host?: string) {
  if (!host) {
    return undefined;
  }

  return `${protocol}://${host}`;
}

docsRouter.get("/openapi.json", (req, res) => {
  res.json(buildOpenApiDocument(getServerUrl(req.protocol, req.get("host"))));
});

docsRouter.use(
  "/docs",
  swaggerUi.serve,
  (req: Request, res: Response, next: NextFunction) => {
    const document = buildOpenApiDocument(getServerUrl(req.protocol, req.get("host")));
    const middleware = swaggerUi.setup(document, {
      explorer: true,
      customSiteTitle: "ProcessIQ API Docs"
    });

    middleware(req, res, next);
  }
);
