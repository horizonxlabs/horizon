import test from "node:test";
import assert from "node:assert/strict";

const { allowLongAiStreams } = await import("../../apps/platform-api/src/http-timeouts.ts");

test("long AI streams disable Node's 5-minute request kill but keep header/idle guards", () => {
  const server = { requestTimeout: 300_000, headersTimeout: 60_000, keepAliveTimeout: 5_000 };
  allowLongAiStreams(server);
  // Node's default requestTimeout (300s) severs SSE build turns mid-stream ("network error"
  // in the browser) while the server keeps generating — the whole reason this helper exists.
  assert.equal(server.requestTimeout, 0);
  // Slow-header DoS protection must survive.
  assert.equal(server.headersTimeout, 60_000);
  assert.ok(server.keepAliveTimeout > 0);
});
