import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";

const execFileAsync = promisify(execFile);

async function lockingWorkspace(t) {
  const workspace = await mkdtemp(join(tmpdir(), "evcp-container-lock-"));
  const snapshotStore = `${workspace}-snapshots`;
  const stableLock = join(snapshotStore, "stable-reclaim.lock");
  t.after(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(snapshotStore, { recursive: true, force: true });
  });
  await mkdir(join(workspace, "app"), { recursive: true });
  await mkdir(snapshotStore, { recursive: true });
  await writeFile(join(workspace, "app/page.tsx"), "original\n");
  await writeFile(stableLock, "stable\n", { mode: 0o600 });
  await execFileAsync("git", ["-C", workspace, "init", "-q"]);
  await execFileAsync("git", ["-C", workspace, "config", "user.email", "test@example.test"]);
  await execFileAsync("git", ["-C", workspace, "config", "user.name", "Test"]);
  await execFileAsync("git", ["-C", workspace, "add", "-A"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "base"]);
  let transitionQueue = Promise.resolve();
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
        .replaceAll("su -s /bin/sh evcp -c ", "sh -c ");
      const previous = transitionQueue;
      let releaseTransition;
      transitionQueue = new Promise((resolve) => {
        releaseTransition = resolve;
      });
      await previous;
      try {
        const result = await execFileAsync("sh", ["-c", script]);
        return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
      } catch (error) {
        return {
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? error.message,
          exitCode: error.code ?? 1
        };
      } finally {
        releaseTransition();
      }
    }
  };
  return {
    workspace,
    snapshotStore,
    stableLock,
    docker,
    committer: createContainerGitCommitter(docker)
  };
}

async function markActiveLockStale(snapshotStore) {
  const staleTime = new Date(Date.now() - 8_000_000);
  await writeFile(
    join(snapshotStore, "active.lock/timestamp"),
    `${Math.floor(staleTime.getTime() / 1000)}\n`
  );
  await utimes(join(snapshotStore, "active.lock"), staleTime, staleTime);
}

test("public restore cannot race an active turn snapshot from another committer instance", async (t) => {
  const { committer, docker } = await lockingWorkspace(t);
  const competing = createContainerGitCommitter(docker);
  const snapshot = await committer.prepare("c1");

  await assert.rejects(() => competing.restore("c1", "abcd"), /snapshot lock is active/i);
  await committer.releaseSnapshot("c1", snapshot);
});

test("two stale-lock reclaim contenders never delete the winner's active lock", async (t) => {
  const { snapshotStore, committer } = await lockingWorkspace(t);
  const stale = await committer.prepare("c1");
  await markActiveLockStale(snapshotStore);

  const results = await Promise.allSettled([committer.prepare("c1"), committer.prepare("c1")]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /snapshot lock is active/i);
  const winner = fulfilled[0].value;
  assert.equal((await readFile(join(snapshotStore, "active.lock/token"), "utf8")).trim(), winner);
  await committer.releaseSnapshot("c1", winner);
  await assert.rejects(readFile(join(snapshotStore, "snapshots", stale, "head"), "utf8"), /ENOENT/);
});

test("fresh tokenless locks block while stale tokenless locks recover", async (t) => {
  const { snapshotStore, committer } = await lockingWorkspace(t);
  await mkdir(join(snapshotStore, "snapshots"), { recursive: true });
  await mkdir(join(snapshotStore, "active.lock"));

  await assert.rejects(() => committer.prepare("c1"), /snapshot lock is active/i);
  await markActiveLockStale(snapshotStore);

  const recovered = await committer.prepare("c1");
  assert.equal(
    (await readFile(join(snapshotStore, "active.lock/token"), "utf8")).trim(),
    recovered
  );
  await committer.releaseSnapshot("c1", recovered);
});

test("a live turn renews its snapshot lease so it is never reclaimed as stale", async (t) => {
  const { snapshotStore, committer } = await lockingWorkspace(t);
  const snapshot = await committer.prepare("c1");
  await markActiveLockStale(snapshotStore);

  await committer.renewSnapshot("c1", snapshot);

  await assert.rejects(() => committer.prepare("c1"), /snapshot lock is active/i);
  await committer.releaseSnapshot("c1", snapshot);
});

test("fresh legacy reclaim residue blocks and stale residue migrates under the stable lock", async (t) => {
  const { snapshotStore, stableLock, committer } = await lockingWorkspace(t);
  await mkdir(join(snapshotStore, "snapshots"), { recursive: true });
  await mkdir(join(snapshotStore, "reclaim.lock"));
  await writeFile(join(snapshotStore, "reclaim.lock/owner"), "legacy owner\n");

  await assert.rejects(() => committer.prepare("c1"), /legacy snapshot reclaim is active/i);
  const stableBefore = await stat(stableLock);
  const staleTime = new Date(Date.now() - 8_000_000);
  await utimes(join(snapshotStore, "reclaim.lock"), staleTime, staleTime);
  const afterUpgrade = await committer.prepare("c1");
  const stableAfter = await stat(stableLock);
  assert.equal(stableAfter.ino, stableBefore.ino);
  assert.equal(await readFile(stableLock, "utf8"), "stable\n");
  await committer.releaseSnapshot("c1", afterUpgrade);
  await assert.rejects(stat(join(snapshotStore, "reclaim.lock")), /ENOENT/);
});

test("three stale legacy migration contenders share one stable inode and one winner", async (t) => {
  const { snapshotStore, stableLock, committer } = await lockingWorkspace(t);
  await mkdir(join(snapshotStore, "snapshots"), { recursive: true });
  await mkdir(join(snapshotStore, "reclaim.lock"));
  await writeFile(join(snapshotStore, "reclaim.lock/owner"), "legacy owner\n");
  const staleTime = new Date(Date.now() - 8_000_000);
  await utimes(join(snapshotStore, "reclaim.lock"), staleTime, staleTime);
  const stableBefore = await stat(stableLock);

  const results = await Promise.allSettled([
    committer.prepare("c1"),
    committer.prepare("c1"),
    committer.prepare("c1")
  ]);
  const winners = results.filter((result) => result.status === "fulfilled");
  const losers = results.filter((result) => result.status === "rejected");

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 2);
  assert.ok(losers.every((result) => /snapshot lock is active/i.test(result.reason.message)));
  assert.equal((await stat(stableLock)).ino, stableBefore.ino);
  assert.equal(await readFile(stableLock, "utf8"), "stable\n");
  await assert.rejects(stat(join(snapshotStore, "reclaim.lock")), /ENOENT/);
  await committer.releaseSnapshot("c1", winners[0].value);
  assert.equal((await stat(stableLock)).ino, stableBefore.ino);
  assert.equal(await readFile(stableLock, "utf8"), "stable\n");
});

test("concurrent missing-lock initializers converge on one persistent inode", async (t) => {
  const { stableLock, committer } = await lockingWorkspace(t);
  await rm(stableLock);

  const results = await Promise.allSettled([committer.prepare("c1"), committer.prepare("c1")]);
  const winners = results.filter((result) => result.status === "fulfilled");
  const losers = results.filter((result) => result.status === "rejected");
  const initialized = await stat(stableLock);

  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.match(losers[0].reason.message, /snapshot lock is active/i);
  assert.equal(initialized.mode & 0o777, 0o600);
  await committer.releaseSnapshot("c1", winners[0].value);
  assert.equal((await stat(stableLock)).ino, initialized.ino);
});

test("symlink and nonregular permanent lock paths fail closed", async (t) => {
  const { workspace, stableLock, committer } = await lockingWorkspace(t);
  const target = join(workspace, "attacker-target");
  await rm(stableLock);
  await writeFile(target, "unchanged\n");
  await symlink(target, stableLock);

  await assert.rejects(() => committer.prepare("c1"), /invalid permanent workspace reclaim lock/i);
  assert.equal(await readFile(target, "utf8"), "unchanged\n");
  await rm(stableLock);
  await mkdir(stableLock);

  await assert.rejects(() => committer.prepare("c1"), /invalid permanent workspace reclaim lock/i);
  assert.equal((await stat(stableLock)).isDirectory(), true);
});

test("public restore uses the stale-lock reclaim protocol", async (t) => {
  const { workspace, snapshotStore, committer } = await lockingWorkspace(t);
  const stale = await committer.prepare("c1");
  await markActiveLockStale(snapshotStore);
  const head = (await execFileAsync("git", ["-C", workspace, "rev-parse", "HEAD"])).stdout.trim();

  await committer.restore("c1", head);

  await assert.rejects(readFile(join(snapshotStore, "active.lock/token"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(snapshotStore, "snapshots", stale, "head"), "utf8"), /ENOENT/);
});

test("every transition flocks the permanent path without replacing its inode", async () => {
  const calls = [];
  const committer = createContainerGitCommitter({
    async execInContainer(_containerId, command) {
      calls.push(command);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  });
  const token = await committer.prepare("c1");
  await committer.restore("c1", "abcd");
  await committer.releaseSnapshot("c1", token);
  const scripts = calls.map((command) => command.at(-1));
  const script = scripts[0];

  assert.match(script, /transition_lock="\/var\/lock\/evcp-turn-reclaim\.lock"/);
  assert.match(script, /transition_parent="\$\{transition_lock%\/\*\}"/);
  assert.match(script, /stat -Lc '%u:%g' "\$transition_parent"/);
  assert.match(script, /stat -Lc %a "\$transition_parent"/);
  assert.match(script, /: >> "\$transition_lock"/);
  assert.match(script, /legacy_reclaim="\$snapshot_root\/reclaim\.lock"/);
  assert.match(script, /exec 9<>"\$transition_lock"/);
  assert.match(script, /flock -x 9/);
  assert.match(script, /flock -u 9/);
  assert.doesNotMatch(script, /exec 9>"\$snapshot_root\/reclaim\.lock"/);
  assert.doesNotMatch(script, /: > "\$transition_lock"/);
  assert.doesNotMatch(script, /(?:rm|mv)[^;]*"\$transition_lock"/);
  assert.match(script, /mktemp "\$lock_dir\/\.token\./);
  assert.match(script, /mktemp "\$lock_dir\/\.timestamp\./);
  assert.match(script, /mv -f "\$token_tmp" "\$lock_dir\/token"/);
  assert.match(script, /mv -f "\$timestamp_tmp" "\$lock_dir\/timestamp"/);
  assert.match(script, /mv "\$lock_dir" "\$quarantine_dir"/);
  for (const transition of scripts) {
    assert.match(transition, /flock -x 9/);
    assert.match(transition, /\/var\/lock\/evcp-turn-reclaim\.lock/);
  }
});

test("failed prepare cleanup reacquires the same flock transition", async () => {
  const calls = [];
  const committer = createContainerGitCommitter({
    async execInContainer(_containerId, command) {
      calls.push(command.at(-1));
      return calls.length === 1
        ? { stdout: "", stderr: "capture crashed", exitCode: 1 }
        : { stdout: "", stderr: "", exitCode: 0 };
    }
  });

  await assert.rejects(() => committer.prepare("c1"), /capture crashed/);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /exec 9<>"\$transition_lock"/);
  assert.match(calls[1], /flock -x 9/);
  assert.match(calls[1], /flock -u 9/);
});

test("restore takes the external lock, hard-resets, and cleans untracked files", async () => {
  const calls = [];
  const committer = createContainerGitCommitter({
    async execInContainer(_containerId, command) {
      calls.push(command);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  });

  await committer.restore("c1", "abc123");

  const script = calls[0].join(" ");
  assert.match(script, /mkdir "\$lock_dir"/);
  assert.match(script, /\/var\/lock\/evcp-turn-reclaim\.lock/);
  assert.match(script, /flock -x 9/);
  assert.match(script, /snapshot lock is active/);
  assert.match(script, /cat "\$lock_dir\/token"/);
  assert.match(script, /reset --hard abc123/);
  assert.match(script, /clean -fd/);
  assert.doesNotMatch(script, /rev-list --parents|merge-base --is-ancestor|reset --mixed/);
});
