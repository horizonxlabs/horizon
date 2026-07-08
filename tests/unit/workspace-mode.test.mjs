import test from "node:test";
import assert from "node:assert/strict";

const { normalizeWorkspaceMode, persistWorkspaceMode, readWorkspaceMode, workspaceModeStorageKey } =
  await import("../../apps/creator-web/src/lib/workspace-mode.ts");

function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

test("workspace mode normalizes unknown values to Build", () => {
  assert.equal(normalizeWorkspaceMode("plan"), "plan");
  assert.equal(normalizeWorkspaceMode("build"), "build");
  assert.equal(normalizeWorkspaceMode("anything-else"), "build");
  assert.equal(normalizeWorkspaceMode(undefined), "build");
});

test("workspace mode persists per project", () => {
  const storage = createMemoryStorage();

  persistWorkspaceMode(storage, "proj_one", "plan");
  persistWorkspaceMode(storage, "proj_two", "build");

  assert.equal(readWorkspaceMode(storage, "proj_one"), "plan");
  assert.equal(readWorkspaceMode(storage, "proj_two"), "build");
  assert.equal(readWorkspaceMode(storage, "proj_missing"), "build");
  assert.equal(workspaceModeStorageKey("proj_one"), "evcp.creator.workspaceMode.proj_one");
});

test("workspace mode does not locally block Plan prompts that describe changes", () => {
  assert.equal(normalizeWorkspaceMode("plan"), "plan");
  assert.equal(normalizeWorkspaceMode("build"), "build");
});
