import { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler<TRequest extends Request = Request>(
  handler: (req: TRequest, res: Response, next: NextFunction) => unknown | Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as TRequest, res, next)).catch(next);
  };
}
