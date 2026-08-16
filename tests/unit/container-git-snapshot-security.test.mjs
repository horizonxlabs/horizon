import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";

const execFileAsync = promisify(execFile);

async function localGitWorkspace(t) {
  const workspace = await mkdtemp(join(tmpdir(), "evcp-container-git-security-"));
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

async function readSnapshotFile(workspace, snapshotStore, snapshot, fileName) {
  const tree = (await readFile(join(snapshotStore, "snapshots", snapshot, "tree"), "utf8")).trim();
  return (
    await execFileAsync("git", ["-C", workspace, "show", `${tree}:${fileName}`], {
      env: {
        ...process.env,
        GIT_OBJECT_DIRECTORY: join(snapshotStore, "snapshots", snapshot, "objects"),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: join(workspace, ".git/objects")
      }
    })
  ).stdout;
}

async function liveObjectFiles(workspace) {
  const objectRoot = join(workspace, ".git/objects");
  return (await execFileAsync("find", [objectRoot, "-type", "f", "-print"])).stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((path) => path.slice(objectRoot.length + 1))
    .sort();
}

test("prepare rejects hard links before normalizing supported source ownership", async () => {
  const docker = {
    calls: [],
    async execInContainer(containerId, cmd) {
      this.calls.push({ containerId, cmd });
      const script = cmd.at(-1);
      if (script.includes("comparison_tree="))
        return { stdout: "false\n", stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
  const committer = createContainerGitCommitter(docker);

  const token = await committer.prepare("c1");
  assert.equal(await committer.hasChanges("c1", token), false);

  const prepareScript = docker.calls[0].cmd.at(-1);
  assert.match(prepareScript, /-print0 \| while IFS= read -r -d '' source_path/);
  assert.match(prepareScript, /supported source hard links are not supported/);
  assert.doesNotMatch(prepareScript, /\.evcp-inode|cp "\$source_path"/);
  assert.ok(
    prepareScript.indexOf('link_count="$(stat -c %h') <
      prepareScript.indexOf("! -user evcp -exec chown -h evcp:evcp {} +"),
    "supported source hard links must be rejected before ownership normalization"
  );
  assert.ok(
    prepareScript.indexOf("! -user evcp -exec chown -h evcp:evcp {} +") <
      prepareScript.indexOf('GIT_INDEX_FILE="$snapshot_dir/index"'),
    "supported source ownership must be normalized before baseline capture"
  );
});

test("root-only snapshot restores ignored source exactly and owned release makes it unusable", async (t) => {
  const { workspace, snapshotStore, git, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, ".gitignore"), "*.cache\n");
  await writeFile(join(workspace, "app/local.cache"), "pre-turn ignored source\n");
  const headBefore = await git("rev-parse", "HEAD");
  const statusBefore = await git("status", "--porcelain");
  const indexBefore = await git("write-tree");

  const snapshot = await committer.prepare("c1");
  assert.equal(
    await readSnapshotFile(workspace, snapshotStore, snapshot, "app/local.cache"),
    "pre-turn ignored source\n"
  );
  assert.equal((await stat(snapshotStore)).mode & 0o777, 0o700);
  assert.equal(
    (await stat(join(snapshotStore, "snapshots", snapshot, "index"))).mode & 0o777,
    0o600
  );
  assert.equal(
    (await stat(join(snapshotStore, "snapshots", snapshot, "tree"))).mode & 0o777,
    0o600
  );
  assert.equal(
    (await stat(join(snapshotStore, "snapshots", snapshot, "manifest"))).mode & 0o777,
    0o600
  );
  assert.equal(
    (await stat(join(snapshotStore, "snapshots", snapshot, "archive"))).mode & 0o777,
    0o600
  );
  assert.equal(
    (await stat(join(snapshotStore, "snapshots", snapshot, "objects"))).mode & 0o777,
    0o700
  );
  assert.equal((await stat(join(workspace, ".git"))).mode & 0o777, 0o700);

  await writeFile(join(workspace, "app/local.cache"), "broken ignored source\n");
  await writeFile(join(workspace, "app/model.cache"), "remove ignored output\n");
  await mkdir(join(workspace, "app/vendor/.git"), { recursive: true });
  await writeFile(join(workspace, "app/vendor/.git/HEAD"), "ref: refs/heads/main\n");
  assert.equal(await committer.hasChanges("c1", snapshot), true);

  await committer.restoreSnapshot("c1", snapshot);

  assert.equal(await git("rev-parse", "HEAD"), headBefore);
  assert.equal(await git("status", "--porcelain"), statusBefore);
  assert.equal(await git("write-tree"), indexBefore);
  assert.equal(
    await readFile(join(workspace, "app/local.cache"), "utf8"),
    "pre-turn ignored source\n"
  );
  await assert.rejects(readFile(join(workspace, "app/model.cache"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(workspace, "app/vendor/.git/HEAD"), "utf8"), /ENOENT/);

  await committer.releaseSnapshot("c1", snapshot);
  await assert.rejects(
    readFile(join(snapshotStore, "snapshots", snapshot, "head"), "utf8"),
    /ENOENT/
  );
  await assert.rejects(() => committer.hasChanges("c1", snapshot), /snapshot lock.*not owned/i);
  await assert.rejects(
    () => committer.restoreSnapshot("c1", snapshot),
    /snapshot lock.*not owned/i
  );
});

test("snapshot blobs stay outside the live repository and release removes them", async (t) => {
  const { workspace, snapshotStore, committer } = await localGitWorkspace(t);
  const ignoredPath = join(workspace, "app/private.cache");
  const secret = `ignored-secret-${randomUUID()}\n`;
  await writeFile(join(workspace, ".gitignore"), "*.cache\n");
  await writeFile(ignoredPath, secret);
  const secretBlob = (
    await execFileAsync("git", ["-C", workspace, "hash-object", ignoredPath])
  ).stdout.trim();
  const objectsBefore = await liveObjectFiles(workspace);
  await assert.rejects(execFileAsync("git", ["-C", workspace, "cat-file", "-e", secretBlob]));

  const snapshot = await committer.prepare("c1");

  assert.deepEqual(await liveObjectFiles(workspace), objectsBefore);
  await assert.rejects(execFileAsync("git", ["-C", workspace, "cat-file", "-p", secretBlob]));
  assert.equal(
    await readSnapshotFile(workspace, snapshotStore, snapshot, "app/private.cache"),
    secret
  );

  await writeFile(ignoredPath, `current-secret-${randomUUID()}\n`);
  const currentBlob = (
    await execFileAsync("git", ["-C", workspace, "hash-object", ignoredPath])
  ).stdout.trim();
  assert.equal(await committer.hasChanges("c1", snapshot), true);
  assert.deepEqual(await liveObjectFiles(workspace), objectsBefore);
  await assert.rejects(execFileAsync("git", ["-C", workspace, "cat-file", "-e", currentBlob]));
  assert.equal(
    (await readdir(snapshotStore)).some((entry) => entry.startsWith("compare.")),
    false
  );

  await committer.releaseSnapshot("c1", snapshot);
  await assert.rejects(stat(join(snapshotStore, "snapshots", snapshot)), /ENOENT/);
  await assert.rejects(execFileAsync("git", ["-C", workspace, "cat-file", "-e", secretBlob]));
});

test("snapshot comparison and restore include supported source modes", async (t) => {
  const { workspace, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, ".gitignore"), "*.cache\n");
  await writeFile(join(workspace, "app/local.cache"), "mode-sensitive source\n");
  await chmod(join(workspace, "app/local.cache"), 0o600);
  const snapshot = await committer.prepare("c1");

  await chmod(join(workspace, "app/local.cache"), 0o644);
  assert.equal(await committer.hasChanges("c1", snapshot), true);
  await committer.restoreSnapshot("c1", snapshot);

  assert.equal((await stat(join(workspace, "app/local.cache"))).mode & 0o777, 0o600);
  await committer.releaseSnapshot("c1", snapshot);
});

test("snapshot equality ignores rewritten file metadata but detects content changes", async (t) => {
  const { workspace, git, committer } = await localGitWorkspace(t);
  const trackedPath = join(workspace, "app/page.tsx");
  const ignoredPath = join(workspace, "app/local.cache");
  await writeFile(join(workspace, ".gitignore"), "*.cache\n");
  await execFileAsync("git", ["-C", workspace, "add", ".gitignore"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "ignore cache"]);
  await writeFile(ignoredPath, "ignored baseline\n");
  const snapshot = await committer.prepare("c1");

  await writeFile(trackedPath, "original\n");
  await writeFile(ignoredPath, "ignored baseline\n");
  const rewrittenAt = new Date(Date.now() + 10_000);
  await utimes(trackedPath, rewrittenAt, rewrittenAt);
  await utimes(ignoredPath, rewrittenAt, rewrittenAt);

  assert.equal(await git("status", "--porcelain"), "");
  assert.equal(await committer.hasChanges("c1", snapshot), false);
  await assert.rejects(
    () => committer.commit("c1", "AI: metadata-only rewrite"),
    /no Git-visible changes/i
  );

  await writeFile(ignoredPath, "changed ignored content\n");
  assert.equal(await committer.hasChanges("c1", snapshot), true);
  await committer.releaseSnapshot("c1", snapshot);
});

test("snapshot comparison and restore preserve symbolic link targets", async (t) => {
  const { workspace, committer } = await localGitWorkspace(t);
  const linkPath = join(workspace, "app/current-page.tsx");
  await symlink("page.tsx", linkPath);
  const snapshot = await committer.prepare("c1");

  await unlink(linkPath);
  await symlink("missing-page.tsx", linkPath);
  assert.equal(await committer.hasChanges("c1", snapshot), true);

  await committer.restoreSnapshot("c1", snapshot);
  assert.equal((await lstat(linkPath)).isSymbolicLink(), true);
  assert.equal(await readlink(linkPath), "page.tsx");
  await committer.releaseSnapshot("c1", snapshot);
});

test("prepare rejects source paths containing control characters", async (t) => {
  const { workspace, committer } = await localGitWorkspace(t);
  await writeFile(join(workspace, "app/bad\nname.ts"), "unsupported\n");

  await assert.rejects(() => committer.prepare("c1"), /control characters.*not supported/i);
});

test("snapshot rollback leaves excluded runtime and dependency directories untouched", async (t) => {
  const { workspace, snapshotStore, git, committer } = await localGitWorkspace(t);
  const runtimeDirs = ["node_modules/pkg", ".next/cache", ".next-preview/cache"];
  for (const directory of runtimeDirs) {
    await mkdir(join(workspace, directory), { recursive: true });
    await writeFile(join(workspace, directory, "state.txt"), "before\n");
  }
  await execFileAsync("git", [
    "-C",
    workspace,
    "add",
    "-f",
    "node_modules",
    ".next",
    ".next-preview"
  ]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "tracked runtime fixtures"]);
  const snapshot = await committer.prepare("c1");
  const tree = (await readFile(join(snapshotStore, "snapshots", snapshot, "tree"), "utf8")).trim();
  const snapshotEntries = (
    await execFileAsync("git", ["-C", workspace, "ls-tree", "-r", "--name-only", tree], {
      env: {
        ...process.env,
        GIT_OBJECT_DIRECTORY: join(snapshotStore, "snapshots", snapshot, "objects"),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: join(workspace, ".git/objects")
      }
    })
  ).stdout;
  for (const directory of runtimeDirs) {
    assert.doesNotMatch(snapshotEntries, new RegExp(`^${directory}/`, "m"));
  }
  for (const directory of runtimeDirs) {
    await writeFile(join(workspace, directory, "state.txt"), "after\n");
  }

  assert.equal(await committer.hasChanges("c1", snapshot), false);
  await committer.restoreSnapshot("c1", snapshot);

  for (const directory of runtimeDirs) {
    assert.equal(await readFile(join(workspace, directory, "state.txt"), "utf8"), "after\n");
  }
  assert.match(await git("status", "--porcelain"), /state\.txt/);
});
