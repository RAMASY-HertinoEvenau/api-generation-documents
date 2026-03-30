import assert from "node:assert/strict";
import test from "node:test";
import { notFoundHandler } from "../middleware/notFound";
import { Request, Response } from "express";

test("notFoundHandler responds with 404 and JSON message", () => {
  let statusCode = 0;
  let body: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    }
  };

  notFoundHandler({} as Request, res as unknown as Response, () => {});

  assert.equal(statusCode, 404);
  assert.deepEqual(body, { message: "Route not found" });
});
