import test from "node:test";
import assert from "node:assert/strict";

const { vibeActionVerb, vibeActionIcon, VIBE_ACTION_VERBS } =
  await import("../../apps/creator-web/src/features/workspace/vibe-actions.ts");

test("vibeActionVerb: returns the active verb while running, for every known type", () => {
  assert.equal(vibeActionVerb("file", "running"), "Creating");
  assert.equal(vibeActionVerb("read", "running"), "Inspecting");
  assert.equal(vibeActionVerb("list", "running"), "Listing");
  assert.equal(vibeActionVerb("edit", "running"), "Editing");
  assert.equal(vibeActionVerb("shell", "running"), "Running");
  assert.equal(vibeActionVerb("migration", "running"), "Migrating");
});

test("vibeActionVerb: returns the done verb once complete, for every known type", () => {
  assert.equal(vibeActionVerb("file", "done"), "Created");
  assert.equal(vibeActionVerb("read", "done"), "Inspected");
  assert.equal(vibeActionVerb("list", "done"), "Listed");
  assert.equal(vibeActionVerb("edit", "done"), "Edited");
  assert.equal(vibeActionVerb("shell", "done"), "Ran");
  assert.equal(vibeActionVerb("migration", "done"), "Migrated");
});

test("vibeActionVerb: always returns Failed when status is failed, regardless of type", () => {
  assert.equal(vibeActionVerb("file", "failed"), "Failed");
  assert.equal(vibeActionVerb("edit", "failed"), "Failed");
  assert.equal(vibeActionVerb("shell", "failed"), "Failed");
  assert.equal(vibeActionVerb("migration", "failed"), "Failed");
  assert.equal(vibeActionVerb("unknown-type", "failed"), "Failed");
});

test("vibeActionVerb: falls back to Working/Done for unrecognized action types", () => {
  assert.equal(vibeActionVerb("unknown-type", "running"), "Working");
  assert.equal(vibeActionVerb("unknown-type", "done"), "Done");
});

test("vibeActionIcon: returns the expected glyph for every known type", () => {
  assert.equal(vibeActionIcon("file"), "📄");
  assert.equal(vibeActionIcon("edit"), "✏️");
  assert.equal(vibeActionIcon("shell"), "⚡");
  assert.equal(vibeActionIcon("migration"), "🗄️");
});

test("vibeActionIcon: falls back to a bullet for unrecognized types", () => {
  assert.equal(vibeActionIcon("unknown-type"), "•");
});

test("VIBE_ACTION_VERBS: exposes all documented action types", () => {
  assert.deepEqual(Object.keys(VIBE_ACTION_VERBS).sort(), [
    "edit",
    "file",
    "list",
    "migration",
    "read",
    "shell"
  ]);
});
