import test from "node:test";
import assert from "node:assert/strict";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";

function fakeDocker(scripted) {
  return {
    calls: [],
    async execInContainer(containerId, cmd) {
      this.calls.push({ containerId, cmd });
      const script = cmd.join(" ");
      for (const [pattern, result] of scripted) {
        if (script.includes(pattern)) return result;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

test("commit initializes the repo, stages all, commits, and returns the HEAD sha", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "abc123def456\n", stderr: "", exitCode: 0 }]
  ]);
  const committer = createContainerGitCommitter(docker);

  const sha = await committer.commit("container-1", "AI: add a home page");

  assert.equal(sha, "abc123def456");
  // one combined shell invocation into the right container
  assert.equal(docker.calls[0].containerId, "container-1");
  const script = docker.calls.map((c) => c.cmd.join(" ")).join(" | ");
  assert.match(script, /git init/);
  assert.match(script, /git add -A/);
  assert.match(script, /git commit/);
  // commit message is passed (shell-safe)
  assert.match(script, /AI: add a home page/);
});

test("throws if the git command fails hard (non-zero on the rev-parse read)", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }]
  ]);
  const committer = createContainerGitCommitter(docker);
  await assert.rejects(() => committer.commit("c1", "msg"), /git commit failed|rev-parse/i);
});
