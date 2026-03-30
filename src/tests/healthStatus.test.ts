import assert from "node:assert/strict";
import test from "node:test";
import { resolveOverallHealthStatus } from "../services/healthStatus";

test("resolveOverallHealthStatus returns down when mongo is down and queue is up", () => {
  assert.equal(resolveOverallHealthStatus("down", "up"), "down");
});

test("resolveOverallHealthStatus returns down when mongo is up and queue is down", () => {
  assert.equal(resolveOverallHealthStatus("up", "down"), "down");
});

test("resolveOverallHealthStatus returns down when both are down", () => {
  assert.equal(resolveOverallHealthStatus("down", "down"), "down");
});

test("resolveOverallHealthStatus returns degraded when mongo is degraded", () => {
  assert.equal(resolveOverallHealthStatus("degraded", "up"), "degraded");
});

test("resolveOverallHealthStatus returns degraded when queue is degraded", () => {
  assert.equal(resolveOverallHealthStatus("up", "degraded"), "degraded");
});

test("resolveOverallHealthStatus returns degraded when both are degraded", () => {
  assert.equal(resolveOverallHealthStatus("degraded", "degraded"), "degraded");
});

test("resolveOverallHealthStatus returns ok only when both are up", () => {
  assert.equal(resolveOverallHealthStatus("up", "up"), "ok");
});

test("resolveOverallHealthStatus prioritizes down over degraded", () => {
  assert.equal(resolveOverallHealthStatus("down", "degraded"), "down");
  assert.equal(resolveOverallHealthStatus("degraded", "down"), "down");
});
