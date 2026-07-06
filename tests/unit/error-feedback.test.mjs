import test from "node:test";
import assert from "node:assert/strict";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

test("allows up to 2 retries per action then stops", () => {
  const tracker = createErrorFeedbackTracker();
  assert.equal(tracker.shouldRetry("act-1"), true);
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), true);
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), false);
});

test("tracks failure counts independently per action id", () => {
  const tracker = createErrorFeedbackTracker();
  tracker.recordFailure("act-1");
  tracker.recordFailure("act-1");
  assert.equal(tracker.shouldRetry("act-1"), false);
  assert.equal(tracker.shouldRetry("act-2"), true);
});

test("reset clears the failure count for an action", () => {
  const tracker = createErrorFeedbackTracker();
  tracker.recordFailure("act-1");
  tracker.recordFailure("act-1");
  tracker.reset("act-1");
  assert.equal(tracker.shouldRetry("act-1"), true);
});

test("builds a retry prompt embedding exit code and stderr", () => {
  const tracker = createErrorFeedbackTracker();
  const prompt = tracker.buildRetryPrompt(
    { id: "act-1", type: "shell", command: "npm run build" },
    { ok: false, error: "shell command exited 1", stdout: "compiling...\n", stderr: "TS2322: type error\n", exitCode: 1 }
  );
  assert.match(prompt, /npm run build/);
  assert.match(prompt, /exit code 1/);
  assert.match(prompt, /TS2322: type error/);
});
