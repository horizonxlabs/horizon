import test from "node:test";
import assert from "node:assert/strict";
import { createDockerGitPort } from "../../apps/platform-api/src/publish/git-port.ts";

function fakeDocker(responder) {
  const calls = [];
  return {
    calls,
    async execInContainer(containerId, cmd) {
      calls.push({ containerId, cmd });
      return responder(cmd);
    }
  };
}

test("currentCommit runs `git -C /workspace rev-parse HEAD` in the dev container and trims output", async () => {
  const docker = fakeDocker((cmd) =>
    cmd.join(" ") === "git -C /workspace rev-parse HEAD"
      ? { stdout: "abc123\n", stderr: "", exitCode: 0 }
      : { stdout: "", stderr: "unexpected", exitCode: 1 }
  );
  const git = createDockerGitPort(docker, () => "dev-c1");
  assert.equal(await git.currentCommit("p1"), "abc123");
  assert.deepEqual(docker.calls[0], { containerId: "dev-c1", cmd: ["git", "-C", "/workspace", "rev-parse", "HEAD"] });
});

test("checkoutCommit runs `git -C /workspace checkout <sha>` and throws on non-zero exit", async () => {
  const ok = createDockerGitPort(
    fakeDocker(() => ({ stdout: "", stderr: "", exitCode: 0 })),
    () => "dev-c1"
  );
  await ok.checkoutCommit("p1", "sha9");

  const bad = createDockerGitPort(
    fakeDocker(() => ({ stdout: "", stderr: "pathspec did not match", exitCode: 1 })),
    () => "dev-c1"
  );
  await assert.rejects(() => bad.checkoutCommit("p1", "nope"), /git checkout nope failed/);
});

test("isWorkingTreeClean is true only when `git status --porcelain` is empty", async () => {
  const clean = createDockerGitPort(fakeDocker(() => ({ stdout: "\n", stderr: "", exitCode: 0 })), () => "c");
  assert.equal(await clean.isWorkingTreeClean("p1"), true);

  const dirty = createDockerGitPort(fakeDocker(() => ({ stdout: " M src/a.ts\n", stderr: "", exitCode: 0 })), () => "c");
  assert.equal(await dirty.isWorkingTreeClean("p1"), false);
});

test("listMigrationNames returns dir entries at the commit, and [] when the tree path is absent", async () => {
  const withMigrations = createDockerGitPort(
    fakeDocker(() => ({ stdout: "0001_init\n0002_add_users\n", stderr: "", exitCode: 0 })),
    () => "c"
  );
  assert.deepEqual(await withMigrations.listMigrationNames("p1", "sha1"), ["0001_init", "0002_add_users"]);

  const noMigrations = createDockerGitPort(
    fakeDocker(() => ({ stdout: "", stderr: "not a tree object", exitCode: 128 })),
    () => "c"
  );
  assert.deepEqual(await noMigrations.listMigrationNames("p1", "sha1"), []);
});
