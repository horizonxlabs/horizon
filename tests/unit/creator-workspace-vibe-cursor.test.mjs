import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the streaming cursor only renders on the active (last) assistant message, not every past one", async () => {
  const page = await readFile("apps/creator-web/src/features/workspace/WorkspacePage.tsx", "utf8");

  // Regression: an action-only past turn (text and reasoning both empty, e.g. a
  // "Migrated ..." message) used to re-render its own blinking cursor for as long as
  // *any* turn was streaming, since the condition never checked which message was last —
  // stacking up one blinking cursor per such history entry above the live one.
  //
  // The `message.text ||` clause (added by PR #228, "keep the loading cursor lit through
  // the whole streaming turn") keeps the cursor lit for the rest of a long response's own
  // generation instead of vanishing the instant the first token lands — still gated to the
  // last message, so the original regression guard above still holds.
  assert.match(
    page,
    /isVibing &&\s+messageIndex === vibeMessages\.length - 1 &&\s+\(message\.text \|\| !message\.reasoning\)/
  );
});
