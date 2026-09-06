import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace Projects link returns to the real Creator project dashboard", () => {
  const source = readFileSync(
    "apps/creator-web/src/features/workspace/WorkspaceHeader.tsx",
    "utf8"
  );
  assert.match(source, /vibe-live-back-link" href="\/creator\/"/);
  assert.doesNotMatch(source, /vibe-live-back-link" href="\/creator\/projects"/);
});
