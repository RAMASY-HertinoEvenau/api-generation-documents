import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CircuitBreaker } from "../lib/circuitBreaker";

test("CircuitBreaker opens after reaching the failure threshold", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeoutMs: 50,
    requestTimeoutMs: 500
  });

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("boom-1"))));
  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("boom-2"))));
  await assert.rejects(() => cb.execute(async () => "ok"), /boom-2/);

  assert.equal(cb.getSnapshot().state, "open");
});

test("CircuitBreaker returns to closed after a successful half-open probe", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 25,
    requestTimeoutMs: 500
  });

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("boom"))));
  await delay(35);

  const result = await cb.execute(async () => "recovered");

  assert.equal(result, "recovered");
  assert.equal(cb.getSnapshot().state, "closed");
});

test("CircuitBreaker rejects immediately when open", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 5000,
    requestTimeoutMs: 500
  });

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("fail"))));
  assert.equal(cb.getSnapshot().state, "open");

  await assert.rejects(() => cb.execute(async () => "should-not-run"), /fail/);
});

test("CircuitBreaker timeout rejects slow operations", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 5000,
    requestTimeoutMs: 50
  });

  await assert.rejects(
    () => cb.execute(async () => delay(200).then(() => "too-slow")),
    /timed out/
  );

  assert.equal(cb.getSnapshot().consecutiveFailures, 1);
});

test("CircuitBreaker resets failure count on success", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 5000,
    requestTimeoutMs: 500
  });

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("fail-1"))));
  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("fail-2"))));
  assert.equal(cb.getSnapshot().consecutiveFailures, 2);

  await cb.execute(async () => "success");
  assert.equal(cb.getSnapshot().consecutiveFailures, 0);
  assert.equal(cb.getSnapshot().state, "closed");
});

test("CircuitBreaker half-open rejects concurrent probes", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 25,
    requestTimeoutMs: 2000
  });

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("fail"))));
  await delay(35);

  const slowProbe = cb.execute(async () => {
    await delay(100);
    return "slow-probe";
  });

  await assert.rejects(
    () => cb.execute(async () => "second-probe"),
    /half-open probe already in progress/
  );

  await slowProbe;
  assert.equal(cb.getSnapshot().state, "closed");
});

test("CircuitBreaker getSnapshot includes lastError", async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 5000,
    requestTimeoutMs: 500
  });

  assert.equal(cb.getSnapshot().lastError, undefined);

  await assert.rejects(() => cb.execute(async () => Promise.reject(new Error("specific-error"))));
  assert.equal(cb.getSnapshot().lastError, "specific-error");
});
