import test from "node:test";
import assert from "node:assert/strict";

const { mergeBugReports, buildFixMessage } =
  await import("../../apps/creator-web/src/features/workspace/vibe-bugs.ts");

test("bug reports merge by signature — a repeat updates instead of duplicating", () => {
  const current = [{ signature: "s1", source: "runtime", message: "boom" }];
  const merged = mergeBugReports(current, [
    { signature: "s1", source: "runtime", message: "boom (updated)" },
    { signature: "s2", source: "relay", message: "crash", file: "app/page.tsx" }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((bug) => bug.signature === "s1").message, "boom (updated)");
});

test("Fix bug pre-fills a scoped, history-friendly fix request", () => {
  const message = buildFixMessage({
    signature: "s2",
    source: "relay",
    message: "Cannot read properties of undefined",
    file: "app/page.tsx"
  });
  assert.match(message, /Fix this bug/);
  assert.match(message, /Cannot read properties of undefined/);
  assert.match(message, /app\/page\.tsx/);
  assert.match(message, /relay/);
  assert.match(message, /avoiding unrelated changes/);
  assert.doesNotMatch(message, /[\u0E00-\u0E7F]/);
  const noFile = buildFixMessage({ signature: "s3", source: "build", message: "TS1005" });
  assert.match(noFile, /build/);
  assert.doesNotMatch(noFile, /undefined/);
});
