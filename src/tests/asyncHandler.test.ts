import assert from "node:assert/strict";
import test from "node:test";
import { asyncHandler } from "../utils/asyncHandler";
import { Request, Response } from "express";

function createMockReqRes() {
  return {
    req: {} as Request,
    res: {} as Response,
    nextCalls: [] as unknown[],
    next(err?: unknown) {
      this.nextCalls.push(err);
    }
  };
}

test("asyncHandler forwards synchronous results without calling next with error", async () => {
  const mock = createMockReqRes();
  const handler = asyncHandler(() => {
    return "ok";
  });

  await new Promise<void>((resolve) => {
    handler(mock.req, mock.res, (err?: unknown) => {
      mock.next(err);
      resolve();
    });
    setTimeout(resolve, 50);
  });

  assert.equal(mock.nextCalls.filter((e) => e !== undefined).length, 0);
});

test("asyncHandler catches a rejected promise and passes error to next", async () => {
  const expectedError = new Error("async-failure");
  const handler = asyncHandler(async () => {
    throw expectedError;
  });

  const error = await new Promise<unknown>((resolve) => {
    handler(mock().req, mock().res, (err?: unknown) => {
      resolve(err);
    });
  });

  assert.equal(error, expectedError);
});

function mock() {
  return createMockReqRes();
}
