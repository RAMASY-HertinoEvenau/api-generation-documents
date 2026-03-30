import assert from "node:assert/strict";
import test from "node:test";
import { createBatchSchema } from "../validators/documentValidators";

test("createBatchSchema accepts a single userId", () => {
  const result = createBatchSchema.safeParse({ userIds: ["user-1"] });
  assert.ok(result.success);
  assert.equal(result.data.userIds.length, 1);
});

test("createBatchSchema accepts exactly 1000 userIds", () => {
  const payload = {
    userIds: Array.from({ length: 1000 }, (_, i) => `user-${i + 1}`)
  };
  const result = createBatchSchema.safeParse(payload);
  assert.ok(result.success);
  assert.equal(result.data.userIds.length, 1000);
});

test("createBatchSchema rejects empty array", () => {
  const result = createBatchSchema.safeParse({ userIds: [] });
  assert.equal(result.success, false);
});

test("createBatchSchema rejects more than 1000 userIds", () => {
  const payload = {
    userIds: Array.from({ length: 1001 }, (_, i) => `user-${i + 1}`)
  };
  const result = createBatchSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("createBatchSchema rejects missing userIds field", () => {
  const result = createBatchSchema.safeParse({});
  assert.equal(result.success, false);
});

test("createBatchSchema rejects non-array userIds", () => {
  const result = createBatchSchema.safeParse({ userIds: "user-1" });
  assert.equal(result.success, false);
});

test("createBatchSchema rejects empty string userIds", () => {
  const result = createBatchSchema.safeParse({ userIds: [""] });
  assert.equal(result.success, false);
});

test("createBatchSchema rejects non-string items in userIds", () => {
  const result = createBatchSchema.safeParse({ userIds: [123, 456] });
  assert.equal(result.success, false);
});

test("createBatchSchema accepts varied string userIds", () => {
  const result = createBatchSchema.safeParse({
    userIds: ["user-abc", "user-00001", "some-long-id-value"]
  });
  assert.ok(result.success);
  assert.equal(result.data.userIds.length, 3);
});
