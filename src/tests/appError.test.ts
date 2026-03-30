import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../errors/AppError";

test("AppError stores statusCode, message and details", () => {
  const error = new AppError(422, "Unprocessable", { field: "userId" });

  assert.equal(error.statusCode, 422);
  assert.equal(error.message, "Unprocessable");
  assert.deepEqual(error.details, { field: "userId" });
  assert.ok(error instanceof Error);
});

test("AppError defaults details to undefined", () => {
  const error = new AppError(500, "Internal");

  assert.equal(error.details, undefined);
});
