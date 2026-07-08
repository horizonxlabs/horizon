import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workspacePage = readFileSync("apps/creator-web/src/pages/WorkspacePage.tsx", "utf8");
const vibeHook = readFileSync("apps/creator-web/src/hooks/use-vibe-workspace.ts", "utf8");
const helpers = readFileSync("apps/creator-web/src/hooks/creator-app-helpers.ts", "utf8");

test("Creator workspace exposes project file upload controls and status chips", () => {
  assert.match(workspacePage, /type="file"/);
  assert.match(workspacePage, /Attach files/);
  assert.match(workspacePage, /projectFiles/);
  assert.match(workspacePage, /selectedAttachmentIds/);
});

test("Creator workspace hook uploads files and sends selected attachment ids to chat", () => {
  assert.match(vibeHook, /initializeProjectFileUpload/);
  assert.match(vibeHook, /completeProjectFileUpload/);
  assert.match(vibeHook, /selectedAttachmentIds/);
  assert.match(vibeHook, /attachmentIds/);
  assert.match(helpers, /attachmentIds/);
});
