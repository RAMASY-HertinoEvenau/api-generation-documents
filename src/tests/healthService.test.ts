import assert from "node:assert/strict";
import test from "node:test";
import { resolveOverallHealthStatus } from "../services/healthStatus";

test("resolveOverallHealthStatus returns down when one dependency is down", () => {
  assert.equal(resolveOverallHealthStatus("up", "down"), "down");
  assert.equal(resolveOverallHealthStatus("down", "up"), "down");
});

test("resolveOverallHealthStatus returns degraded when one dependency is degraded", () => {
  assert.equal(resolveOverallHealthStatus("degraded", "up"), "degraded");
  assert.equal(resolveOverallHealthStatus("up", "degraded"), "degraded");
});

test("resolveOverallHealthStatus returns ok when all dependencies are up", () => {
  assert.equal(resolveOverallHealthStatus("up", "up"), "ok");
});
