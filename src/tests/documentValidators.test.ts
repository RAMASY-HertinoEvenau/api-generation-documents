import assert from "node:assert/strict";
import test from "node:test";
import { createBatchSchema } from "../validators/documentValidators";

test("createBatchSchema accepts up to 1000 userIds", () => {
  const payload = {
    userIds: Array.from({ length: 1000 }, (_, index) => `user-${index + 1}`)
  };

  const parsed = createBatchSchema.parse(payload);

  assert.equal(parsed.userIds.length, 1000);
});

test("createBatchSchema rejects an empty batch", () => {
  const result = createBatchSchema.safeParse({ userIds: [] });

  assert.equal(result.success, false);
});

test("createBatchSchema rejects more than 1000 userIds", () => {
  const payload = {
    userIds: Array.from({ length: 1001 }, (_, index) => `user-${index + 1}`)
  };

  const result = createBatchSchema.safeParse(payload);

  assert.equal(result.success, false);
});
