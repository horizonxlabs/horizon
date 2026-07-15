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
  // Subcommands are present (each git call is prefixed with -c safe.directory=/workspace).
  assert.match(script, / init -q/);
  assert.match(script, / add -A/);
  assert.match(script, / commit /);
  // commit message is passed (shell-safe)
  assert.match(script, /AI: add a home page/);
  // every git call guards against "dubious ownership" (exit 128) on differently-owned mounts
  const gitCalls = (script.match(/git /g) ?? []).length;
  const guarded = (script.match(/git -c safe\.directory=\/workspace /g) ?? []).length;
  assert.equal(guarded, gitCalls, "every git invocation must set safe.directory=/workspace");
});

test("throws if the git command fails hard (non-zero on the rev-parse read)", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }]
  ]);
  const committer = createContainerGitCommitter(docker);
  await assert.rejects(() => committer.commit("c1", "msg"), /git commit failed|rev-parse/i);
});

test("prepare creates an initial immutable baseline and removes crash-left dirty changes", async () => {
  const docker = fakeDocker([["rev-parse HEAD", { stdout: "base123\n", stderr: "", exitCode: 0 }]]);
  const workspace = createContainerGitCommitter(docker);

  const sha = await workspace.prepare("c1");

  assert.equal(sha, "base123");
  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /rev-parse --verify HEAD/);
  assert.match(script, /reset --hard HEAD/);
  assert.match(script, /clean -fd/);
  assert.match(script, /EVCP initial workspace/);
});

test("validate builds from a disposable source tree and always cleans it", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  await workspace.validate("c1");

  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /mktemp -d \/tmp\/evcp-validation/);
  assert.match(script, /trap .*rm -rf/);
  assert.match(script, /--exclude=.git/);
  assert.match(script, /--exclude=node_modules/);
  assert.match(script, /--exclude=.next/);
  assert.match(script, /--exclude=.next-\*/);
  assert.match(script, /ln -s \/workspace\/node_modules/);
  assert.match(script, /cd "\$validation_dir"/);
  assert.match(script, /EVCP_VALIDATION_DIST_DIR=.next .*next build/);
});

test("validate never backs up, restores, or builds from active workspace files", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  await workspace.validate("c1");

  const script = docker.calls[0].cmd.join(" ");
  assert.doesNotMatch(script, /cp tsconfig\.json \/tmp/);
  assert.doesNotMatch(script, /cp next-env\.d\.ts \/tmp/);
  assert.doesNotMatch(script, /cp \/tmp\/.* (?:tsconfig\.json|next-env\.d\.ts)/);
  assert.doesNotMatch(script, /cd \/workspace.*next build/);
});

test("restore hard-resets and cleans the workspace to the known-good revision", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  await workspace.restore("c1", "abc123");

  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /reset --hard abc123/);
  assert.match(script, /clean -fd/);
});
