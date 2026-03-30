import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "express";
import { ZodError, z } from "zod";
import { errorHandler } from "../middleware/errorHandler";
import { AppError } from "../errors/AppError";

function createMockRes() {
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    getBody() {
      return body;
    }
  };
  return res;
}

test("errorHandler responds 400 for ZodError", () => {
  const schema = z.object({ name: z.string() });
  let zodError: ZodError | undefined;
  try {
    schema.parse({ name: 123 });
  } catch (e) {
    zodError = e as ZodError;
  }

  const res = createMockRes();
  errorHandler(zodError!, {} as Request, res as unknown as Response, () => {});

  assert.equal(res.getStatusCode(), 400);
  assert.ok((res.getBody() as { message: string }).message === "Validation error");
});

test("errorHandler responds with custom status for AppError", () => {
  const error = new AppError(409, "Conflict detected", { batchId: "abc" });
  const res = createMockRes();

  errorHandler(error, {} as Request, res as unknown as Response, () => {});

  assert.equal(res.getStatusCode(), 409);
  const body = res.getBody() as { message: string; details: unknown };
  assert.equal(body.message, "Conflict detected");
  assert.deepEqual(body.details, { batchId: "abc" });
});

test("errorHandler responds 500 for unknown errors", () => {
  const error = new Error("unexpected");
  const res = createMockRes();

  errorHandler(error, {} as Request, res as unknown as Response, () => {});

  assert.equal(res.getStatusCode(), 500);
  assert.equal((res.getBody() as { message: string }).message, "Internal server error");
});
