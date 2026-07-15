import test from "node:test";
import assert from "node:assert/strict";
import { createHttpHealthChecker, createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";

test("memory health checker returns the configured result", async () => {
  assert.equal(await createMemoryHealthChecker(true).check("http://x"), true);
  assert.equal(await createMemoryHealthChecker(false).check("http://x"), false);
});

test("http health checker returns true on a 200", async () => {
  const checker = createHttpHealthChecker({ fetchImpl: async () => ({ status: 200 }), retries: 1, delayMs: 0 });
  assert.equal(await checker.check("http://evcp-prod-app:3000/"), true);
});

test("http health checker rejects 401 and 404 responses as not ready", async () => {
  for (const status of [401, 404]) {
    const checker = createHttpHealthChecker({
      fetchImpl: async () => ({ status }),
      retries: 1,
      delayMs: 0
    });
    assert.equal(await checker.check("http://app/api/health"), false);
  }
});

test("http health checker returns false after exhausting retries on 5xx", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 503 };
  };
  const checker = createHttpHealthChecker({ fetchImpl, retries: 3, delayMs: 0 });
  assert.equal(await checker.check("http://x"), false);
  assert.equal(calls, 3);
});

test("http health checker treats a thrown network error as unhealthy", async () => {
  const checker = createHttpHealthChecker({
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
    retries: 2, delayMs: 0
  });
  assert.equal(await checker.check("http://x"), false);
});
