import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";

test("memory git port reports clean/dirty working tree per project", async () => {
  const git = createMemoryGitPort({
    "p1": { clean: true, head: "sha1", migrationNames: { sha1: ["001_init"] } }
  });
  assert.equal(await git.isWorkingTreeClean("p1"), true);
  git.state.projects["p1"].clean = false;
  assert.equal(await git.isWorkingTreeClean("p1"), false);
});

test("currentCommit returns HEAD and checkoutCommit moves HEAD", async () => {
  const git = createMemoryGitPort({ "p1": { clean: true, head: "sha1", migrationNames: {} } });
  assert.equal(await git.currentCommit("p1"), "sha1");
  await git.checkoutCommit("p1", "sha2");
  assert.equal(await git.currentCommit("p1"), "sha2");
  assert.deepEqual(git.state.projects["p1"].checkouts, ["sha2"]);
});

test("listMigrationNames returns the migration files recorded for a commit", async () => {
  const git = createMemoryGitPort({
    "p1": { clean: true, head: "sha1", migrationNames: { sha1: ["001_init", "002_users"] } }
  });
  assert.deepEqual(await git.listMigrationNames("p1", "sha1"), ["001_init", "002_users"]);
  assert.deepEqual(await git.listMigrationNames("p1", "unknown"), []);
});

test("throws for an unknown project", async () => {
  const git = createMemoryGitPort({});
  await assert.rejects(() => git.currentCommit("nope"), /no git repo/);
});
