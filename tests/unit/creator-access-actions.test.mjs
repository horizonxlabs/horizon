import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

test("Creator access actions target the selected request and expose both decisions", () => {
  const hook = readFileSync(
    "apps/creator-web/src/features/publish/use-publish-access.ts",
    "utf8"
  );
  const page = readFileSync("apps/creator-web/src/features/users/UsersPage.tsx", "utf8");

  assert.match(hook, /handleAccessRequestDecision\(requestId.*decision/);
  assert.match(hook, /decidingAccessRequestId/);
  assert.match(page, />Approve</);
  assert.match(page, />Reject</);
  assert.doesNotMatch(hook, /find\(\s*\(request\) => request\.status === "pending"/);
});
