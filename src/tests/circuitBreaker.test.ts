import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CircuitBreaker } from "../lib/circuitBreaker";

test("CircuitBreaker opens after reaching the failure threshold", async () => {
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 50,
    requestTimeoutMs: 25
  });

  await assert.rejects(() => circuitBreaker.execute(async () => Promise.reject(new Error("boom-1"))));
  await assert.rejects(() => circuitBreaker.execute(async () => Promise.reject(new Error("boom-2"))));
  await assert.rejects(() => circuitBreaker.execute(async () => "ok"), /boom-2/);

  assert.equal(circuitBreaker.getSnapshot().state, "open");
});

test("CircuitBreaker returns to closed after a successful half-open probe", async () => {
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 25,
    requestTimeoutMs: 25
  });

  await assert.rejects(() => circuitBreaker.execute(async () => Promise.reject(new Error("boom"))));
  await delay(35);

  const result = await circuitBreaker.execute(async () => "ok");

  assert.equal(result, "ok");
  assert.equal(circuitBreaker.getSnapshot().state, "closed");
});
