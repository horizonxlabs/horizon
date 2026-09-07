import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the streaming cursor has one owner and only renders on the active assistant timeline", async () => {
  const [page, timeline] = await Promise.all([
    readFile("apps/creator-web/src/features/workspace/WorkspacePage.tsx", "utf8"),
    readFile("apps/creator-web/src/features/workspace/VibeTurnTimeline.tsx", "utf8")
  ]);

  // Regression: an action-only past turn (text and reasoning both empty, e.g. a
  // "Migrated ..." message) used to re-render its own blinking cursor for as long as
  // *any* turn was streaming, since the condition never checked which message was last —
  // stacking up one blinking cursor per such history entry above the live one.
  //
  // WorkspacePage decides which timeline is live; the timeline itself owns the only cursor.
  // Keeping a second legacy cursor here produced two blocks before the first streamed token.
  assert.match(page, /live=\{isVibing && messageIndex === vibeMessages\.length - 1\}/);
  assert.doesNotMatch(page, /className="vibe-cursor-blink"/);
  assert.match(timeline, /live && parts\.length === 0/);
});
