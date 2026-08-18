import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
const execFileAsync = promisify(execFile);
const snapshotToken = "11111111-1111-4111-8111-111111111111";

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

async function localGitWorkspace(t) {
  const workspace = await mkdtemp(join(tmpdir(), "evcp-container-git-"));
  const snapshotStore = `${workspace}-snapshot-store`;
  const stableLock = join(snapshotStore, "stable-reclaim.lock");
  t.after(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(snapshotStore, { recursive: true, force: true });
  });
  await mkdir(join(workspace, "app"), { recursive: true });
  await writeFile(join(workspace, "app/page.tsx"), "original\n");
  await execFileAsync("git", ["-C", workspace, "init", "-q"]);
  await execFileAsync("git", ["-C", workspace, "config", "user.email", "test@example.test"]);
  await execFileAsync("git", ["-C", workspace, "config", "user.name", "Test"]);
  await execFileAsync("git", ["-C", workspace, "add", "-A"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "base"]);

  const docker = {
    async execInContainer(_containerId, command) {
      const script = command
        .at(-1)
        .replaceAll("/var/lock/evcp-turn-reclaim.lock", stableLock)
        .replaceAll("/var/lib/evcp/turn-snapshots", snapshotStore)
        .replaceAll("/workspace", workspace)
        .replaceAll("chown -R root:root", "true")
        .replaceAll("chown root:root", "true")
        .replaceAll("! -user evcp -exec chown -h evcp:evcp {} +", "-exec true {} +")
        .replaceAll("-exec chown -h evcp:evcp {} +", "-exec true {} +")
        .replaceAll("chown -h evcp:evcp", "true")
        .replaceAll('[ "$(id -u)" = 0 ]', "[ 0 = 0 ]")
        .replaceAll("flock -x 9", "true")
        .replaceAll("flock -u 9", "true")
        .replaceAll('chown -R evcp:evcp "$validation_dir"', "true")
        .replaceAll("su -s /bin/sh evcp -c ", "sh -c ");
      try {
        const result = await execFileAsync("sh", ["-c", script]);
        return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
      } catch (error) {
        return {
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? error.message,
          exitCode: error.code ?? 1
        };
      }
    }
  };
  const git = async (...args) =>
    (await execFileAsync("git", ["-C", workspace, ...args])).stdout.trim();
  return { workspace, snapshotStore, git, committer: createContainerGitCommitter(docker) };
}

async function readSnapshotFile(workspace, snapshotStore, snapshot, path) {
  const tree = (await readFile(join(snapshotStore, "snapshots", snapshot, "tree"), "utf8")).trim();
  return (
    await execFileAsync("git", ["-C", workspace, "show", `${tree}:${path}`], {
      env: {
        ...process.env,
        GIT_OBJECT_DIRECTORY: join(snapshotStore, "snapshots", snapshot, "objects"),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: join(workspace, ".git/objects")
      }
    })
  ).stdout;
}

test("commit stages Git-visible source, commits, and returns the HEAD sha", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "abc123def456\n", stderr: "", exitCode: 0 }]
  ]);
  const committer = createContainerGitCommitter(docker);

  const sha = await committer.commit("container-1", "AI: add a home page");
  assert.equal(sha, "abc123def456");
  // one combined shell invocation into the right container
  assert.equal(docker.calls[0].containerId, "container-1");
  assert.deepEqual(docker.calls[0].cmd.slice(0, 2), ["sh", "-c"]);
  const script = docker.calls.map((c) => c.cmd.join(" ")).join(" | ");
  // Subcommands are present (each git call is prefixed with -c safe.directory=/workspace).
  assert.match(script, / add -A/);
  assert.match(script, / commit /);
  assert.match(script, /commit --no-verify/);
  assert.doesNotMatch(script, /commit --allow-empty/);
  // commit message is passed (shell-safe)
  assert.match(script, /AI: add a home page/);
  // every git call guards against "dubious ownership" (exit 128) on differently-owned mounts
  assert.doesNotMatch(
    script.replaceAll("git -c safe.directory=/workspace", ""),
    /(?:^|[;&|]\s*)git\s/,
    "every git invocation must set safe.directory=/workspace"
  );
});

test("throws if the git command fails hard (non-zero on the rev-parse read)", async () => {
  const docker = fakeDocker([
    ["rev-parse HEAD", { stdout: "", stderr: "fatal: not a git repository", exitCode: 128 }]
  ]);
  const committer = createContainerGitCommitter(docker);
  await assert.rejects(() => committer.commit("c1", "msg"), /git commit failed|rev-parse/i);
});

test("ignored-only mutation cannot create a commit and rolls back clearly", async (t) => {
  const { workspace, git, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, ".gitignore"), "*.cache\n");
  await execFileAsync("git", ["-C", workspace, "add", ".gitignore"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "ignore cache"]);
  const headBefore = await git("rev-parse", "HEAD");
  const snapshot = await committer.prepare("c1");
  await writeFile(join(workspace, "app/generated.cache"), "ignored model output\n");

  assert.equal(await committer.hasChanges("c1", snapshot), true);
  await assert.rejects(
    () => committer.commit("c1", "AI: ignored output"),
    /no Git-visible changes; ignored-only changes cannot be committed/i
  );
  assert.equal(await git("rev-parse", "HEAD"), headBefore);

  await committer.restoreSnapshot("c1", snapshot);
  await assert.rejects(readFile(join(workspace, "app/generated.cache"), "utf8"), /ENOENT/);
  await committer.releaseSnapshot("c1", snapshot);
});

test("prepare stores source under a root-only token lock outside the workspace", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  const token = await workspace.prepare("c1");

  assert.match(token, /^[0-9a-f-]{36}$/i);
  assert.equal(docker.calls.length, 1);
  assert.deepEqual(docker.calls[0].cmd.slice(0, 2), ["sh", "-c"]);
  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /\/var\/lib\/evcp\/turn-snapshots/);
  assert.match(script, /active\.lock/);
  assert.match(script, /chmod 700/);
  assert.match(script, /GIT_INDEX_FILE="\$snapshot_dir\/index"/);
  assert.match(script, /GIT_OBJECT_DIRECTORY="\$snapshot_dir\/objects"/);
  assert.match(script, /GIT_ALTERNATE_OBJECT_DIRECTORIES=\/workspace\/\.git\/objects/);
  assert.match(script, /add -f -A/);
  assert.match(script, /write-tree/);
  assert.match(script, /manifest/);
  assert.match(script, /archive/);
  assert.match(script, /rev-parse --verify HEAD/);
  assert.match(script, /diff --cached --quiet/);
  assert.match(script, /find .*\.git/);
  assert.match(script, /node_modules/);
  assert.match(script, /\.next-/);
  assert.doesNotMatch(script, /commit-tree|update-ref|refs\/evcp/);
});

test("prepare cleans its owned lock when canonical capture fails", async () => {
  const docker = fakeDocker([
    ["add -f -A", { stdout: "", stderr: "permission denied", exitCode: 1 }]
  ]);
  const workspace = createContainerGitCommitter(docker);

  await assert.rejects(() => workspace.prepare("c1"), /workspace prepare.*permission denied/i);
  assert.equal(docker.calls.length, 2);
  assert.match(docker.calls[1].cmd.join(" "), /active\.lock/);
});

test("hasChanges returns false when the current worktree matches the snapshot tree", async () => {
  const docker = fakeDocker([["comparison_tree=", { stdout: "false\n", stderr: "", exitCode: 0 }]]);
  const workspace = createContainerGitCommitter(docker);

  assert.equal(await workspace.hasChanges("c1", snapshotToken), false);

  const script = docker.calls[0].cmd.join(" ");
  assert.deepEqual(docker.calls[0].cmd.slice(0, 2), ["sh", "-c"]);
  assert.match(script, /active\.lock/);
  assert.match(script, /comparison_tree=/);
  assert.match(script, /write-tree/);
});

test("hasChanges returns true when the current worktree differs from the snapshot tree", async () => {
  const docker = fakeDocker([["comparison_tree=", { stdout: "true\n", stderr: "", exitCode: 0 }]]);
  const workspace = createContainerGitCommitter(docker);

  assert.equal(await workspace.hasChanges("c1", snapshotToken), true);

  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /comparison_tree=/);
});

test("hasChanges reports a clear error when canonical comparison fails", async () => {
  const docker = fakeDocker([
    ["comparison_tree=", { stdout: "", stderr: "snapshot unavailable", exitCode: 128 }]
  ]);
  const workspace = createContainerGitCommitter(docker);

  await assert.rejects(
    () => workspace.hasChanges("c1", snapshotToken),
    /workspace snapshot comparison failed \(exit 128\).*snapshot unavailable/i
  );
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

test("restoreSnapshot verifies token ownership and restores the protected archive", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  await workspace.restoreSnapshot("c1", snapshotToken);

  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /active\.lock/);
  assert.match(script, /snapshot metadata is missing/);
  assert.match(script, /find \/workspace/);
  assert.match(script, /tar -C \/workspace -xf "\$snapshot_dir\/archive"/);
  assert.match(script, /chmod "\$entry_mode"/);
  assert.match(script, /reset --mixed/);
  assert.doesNotMatch(script, /reset --hard|commit-tree|refs\/evcp/);
});

test("releaseSnapshot deletes only the token-owned metadata and lock", async () => {
  const docker = fakeDocker([]);
  const workspace = createContainerGitCommitter(docker);

  await workspace.releaseSnapshot("c1", snapshotToken);

  const script = docker.calls[0].cmd.join(" ");
  assert.match(script, /active\.lock/);
  assert.match(script, /reclaim\.lock/);
  assert.match(script, /flock -x 9/);
  assert.match(script, /snapshot lock is not owned by token/);
  assert.match(script, /rm -rf "\$snapshot_dir"/);
});

test("dirty pre-turn repairs compare deterministically without changing HEAD or index", async (t) => {
  const { workspace, snapshotStore, git, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, "app/page.tsx"), "pre-turn repair\n");
  await writeFile(join(workspace, "repair-notes.txt"), "keep me\n");
  const headBefore = await git("rev-parse", "HEAD");
  const statusBefore = await git("status", "--porcelain");
  const indexBefore = await git("write-tree");

  const snapshot = await committer.prepare("c1");

  assert.equal(await git("rev-parse", "HEAD"), headBefore);
  assert.equal(await git("status", "--porcelain"), statusBefore);
  assert.equal(await git("write-tree"), indexBefore);
  assert.equal(
    await readFile(join(snapshotStore, "snapshots", snapshot, "head"), "utf8"),
    `${headBefore}\n`
  );
  assert.equal(
    await readSnapshotFile(workspace, snapshotStore, snapshot, "app/page.tsx"),
    "pre-turn repair\n"
  );
  assert.equal(await committer.hasChanges("c1", snapshot), false);
  assert.equal(await committer.hasChanges("c1", snapshot), false);
});

test("restoreSnapshot removes model files while preserving the original dirty baseline", async (t) => {
  const { workspace, git, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, "app/page.tsx"), "pre-turn repair\n");
  await writeFile(join(workspace, "repair-notes.txt"), "keep me\n");
  const headBefore = await git("rev-parse", "HEAD");
  const statusBefore = await git("status", "--porcelain");
  const snapshot = await committer.prepare("c1");
  await writeFile(join(workspace, "app/page.tsx"), "broken model output\n");
  await writeFile(join(workspace, "app/model-file.tsx"), "remove me\n");
  assert.equal(await committer.hasChanges("c1", snapshot), true);

  await committer.restoreSnapshot("c1", snapshot);

  assert.equal(await git("rev-parse", "HEAD"), headBefore);
  assert.equal(await git("status", "--porcelain"), statusBefore);
  assert.equal(await readFile(join(workspace, "app/page.tsx"), "utf8"), "pre-turn repair\n");
  assert.equal(await readFile(join(workspace, "repair-notes.txt"), "utf8"), "keep me\n");
  await assert.rejects(readFile(join(workspace, "app/model-file.tsx"), "utf8"), /ENOENT/);
});

test("restore accepts root and normal commits and leaves the workspace clean", async (t) => {
  const { workspace, git, committer } = await localGitWorkspace(t);
  const rootCommit = await git("rev-list", "--max-parents=0", "HEAD");
  await writeFile(join(workspace, "app/page.tsx"), "second commit\n");
  await execFileAsync("git", ["-C", workspace, "add", "-A"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "second"]);
  const normalCommit = await git("rev-parse", "HEAD");

  await writeFile(join(workspace, "app/page.tsx"), "dirty normal commit\n");
  await writeFile(join(workspace, "normal-untracked.txt"), "remove me\n");
  await committer.restore("c1", normalCommit);

  assert.equal(await git("rev-parse", "HEAD"), normalCommit);
  assert.equal(await git("status", "--porcelain"), "");

  await writeFile(join(workspace, "app/page.tsx"), "dirty root commit\n");
  await writeFile(join(workspace, "root-untracked.txt"), "remove me too\n");
  await committer.restore("c1", rootCommit);

  assert.equal(await git("rev-parse", "HEAD"), rootCommit);
  assert.equal(await git("status", "--porcelain"), "");
});

test("prepare rejects a partially staged pre-turn baseline without changing Git state", async (t) => {
  const { workspace, git, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, "app/page.tsx"), "staged repair\n");
  await execFileAsync("git", ["-C", workspace, "add", "app/page.tsx"]);
  await writeFile(join(workspace, "app/page.tsx"), "partially staged repair\n");
  const headBefore = await git("rev-parse", "HEAD");
  const statusBefore = await git("status", "--porcelain");
  const indexBefore = await git("write-tree");

  await assert.rejects(() => committer.prepare("c1"), /staged.*not supported/i);

  assert.equal(await git("rev-parse", "HEAD"), headBefore);
  assert.equal(await git("status", "--porcelain"), statusBefore);
  assert.equal(await git("write-tree"), indexBefore);
});

test("prepare rejects nested source repositories", async (t) => {
  const { workspace, committer } = await localGitWorkspace(t);
  await mkdir(join(workspace, "app/vendor/.git"), { recursive: true });
  await writeFile(join(workspace, "app/vendor/.git/HEAD"), "ref: refs/heads/main\n");

  await assert.rejects(() => committer.prepare("c1"), /nested \.git.*not supported/i);
});

test("active token lock rejects a concurrent snapshot and release permits a unique successor", async (t) => {
  const { committer } = await localGitWorkspace(t);
  const first = await committer.prepare("c1");

  await assert.rejects(() => committer.prepare("c1"), /snapshot lock is active/i);
  await committer.releaseSnapshot("c1", first);
  const second = await committer.prepare("c1");

  assert.notEqual(second, first);
  await committer.releaseSnapshot("c1", second);
});

test("stale token lock is recovered without retaining its metadata", async (t) => {
  const { snapshotStore, committer } = await localGitWorkspace(t);
  const stale = await committer.prepare("c1");
  const staleTime = new Date(Date.now() - 8_000_000);
  await writeFile(
    join(snapshotStore, "active.lock/timestamp"),
    `${Math.floor(staleTime.getTime() / 1000)}\n`
  );
  await utimes(join(snapshotStore, "active.lock"), staleTime, staleTime);

  const recovered = await committer.prepare("c1");

  assert.notEqual(recovered, stale);
  await assert.rejects(readFile(join(snapshotStore, "snapshots", stale, "head"), "utf8"), /ENOENT/);
  await committer.releaseSnapshot("c1", recovered);
});
