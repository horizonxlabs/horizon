import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceContainerName,
  workspacePhysicalKey,
  workspacePreviewBase
} from "../../apps/platform-api/src/workspace-orchestrator/runtime-location.ts";

test("runtime location uses the persisted physical key for a warm claim", () => {
  const record = { projectId: "prj_alpha", resourceKey: "warm-resource-1" };
  assert.equal(workspacePhysicalKey(record), "warm-resource-1");
  assert.equal(workspaceContainerName(record), "evcp-ws-warm-resource-1");
  assert.equal(workspacePreviewBase(record), "/preview/warm-resource-1");
});

test("runtime location falls back to the logical key for legacy rows", () => {
  const record = { projectId: "prj_alpha" };
  assert.equal(workspacePhysicalKey(record), "prj-alpha");
  assert.equal(workspaceContainerName(record), "evcp-ws-prj-alpha");
});
