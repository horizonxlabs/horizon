import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workspacePage = readFileSync(
  "apps/creator-web/src/features/workspace/WorkspacePage.tsx",
  "utf8"
);
const vibeHook = readFileSync(
  "apps/creator-web/src/features/workspace/use-vibe-workspace.ts",
  "utf8"
);
const projectFilesHook = readFileSync(
  "apps/creator-web/src/features/workspace/use-project-files.ts",
  "utf8"
);
const helpers = readFileSync("apps/creator-web/src/features/workspace/api.ts", "utf8");

test("Creator workspace exposes project file upload controls and status chips", () => {
  assert.match(workspacePage, /type="file"/);
  // The attach control is a "+" icon button in the composer footer (was a labelled "Attach files").
  assert.match(workspacePage, /vibe-composer-attach/);
  assert.match(workspacePage, /handleUploadProjectFiles/);
  assert.match(workspacePage, /projectFiles/);
  assert.match(workspacePage, /selectedAttachmentIds/);
});

test("Creator workspace hook uploads files and sends selected attachment ids to chat", () => {
  assert.match(projectFilesHook, /initializeProjectFileUpload/);
  assert.match(projectFilesHook, /completeProjectFileUpload/);
  assert.match(vibeHook, /selectedAttachmentIds/);
  assert.match(projectFilesHook, /selectedAttachmentIds/);
  assert.match(vibeHook, /attachmentIds/);
  assert.match(helpers, /attachmentIds/);
  assert.doesNotMatch(helpers, /if \(after\) return/);
  assert.match(helpers, /after === "running" \|\| after === "idle"/);
  assert.match(helpers, /state=\$\{after\}/);
});
