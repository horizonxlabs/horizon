import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import test from "node:test";

import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";
const IMAGE = process.env.EVCP_WORKSPACE_IMAGE ?? "evcp/workspace-next:1";

function dockerExec(cid, script) {
  return execFileSync("docker", ["exec", cid, "sh", "-c", script]).toString().trim();
}

function startWorkspace({ restartable = false } = {}) {
  const args = ["run", "-d", ...(restartable ? [] : ["--rm"]), IMAGE];
  const cid = execFileSync("docker", args).toString().trim();
  waitForWorkspace(cid);
  return cid;
}

function waitForWorkspace(cid) {
  dockerExec(
    cid,
    "i=0; until [ -f /workspace/package.json ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
  );
}

function stopWorkspace(cid) {
  execFileSync("docker", ["rm", "-f", cid]);
}

test(
  "missing permanent lock initialization converges, survives restart, and rejects malicious paths",
  { skip: !LIVE },
  async () => {
    const cid = startWorkspace({ restartable: true });
    try {
      const baseDocker = createDockerSocketEngine();
      const baselineCommitter = createContainerGitCommitter(baseDocker);
      const baseline = await baselineCommitter.prepare(cid);
      await baselineCommitter.releaseSnapshot(cid, baseline);
      dockerExec(
        cid,
        "rm -f /tmp/evcp-lock-initializer-1 /tmp/evcp-lock-initializer-2 /var/lock/evcp-turn-reclaim.lock"
      );

      let initializer = 0;
      const racingDocker = {
        async execInContainer(containerId, command) {
          initializer += 1;
          if (initializer > 2) return baseDocker.execInContainer(containerId, command);
          const marker1 = "/tmp/evcp-lock-initializer-1";
          const marker2 = "/tmp/evcp-lock-initializer-2";
          const barrier = [
            '(umask 077; : >> "$transition_lock")',
            `stat -c %d:%i "$transition_lock" > /tmp/evcp-lock-initializer-${initializer}`,
            `i=0; until [ -s ${marker1} ] && [ -s ${marker2} ]; do i=$((i+1)); [ "$i" -lt 100 ] || { echo "lock initialization barrier timed out" >&2; exit 2; }; sleep .05; done`
          ].join("; ");
          const original = command.at(-1);
          const script = original.replace(
            'if [ ! -e "$transition_lock" ]; then (umask 077; : >> "$transition_lock"); fi',
            barrier
          );
          assert.notEqual(script, original, "expected to install the live initializer barrier");
          return baseDocker.execInContainer(containerId, [...command.slice(0, -1), script]);
        }
      };
      const racingCommitter = createContainerGitCommitter(racingDocker);
      const results = await Promise.allSettled([
        racingCommitter.prepare(cid),
        racingCommitter.prepare(cid)
      ]);
      const winners = results.filter((result) => result.status === "fulfilled");
      const losers = results.filter((result) => result.status === "rejected");
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.match(losers[0].reason.message, /snapshot lock is active/i);
      const initializerInodes = dockerExec(
        cid,
        "cat /tmp/evcp-lock-initializer-1 /tmp/evcp-lock-initializer-2"
      ).split("\n");
      assert.equal(initializerInodes.length, 2);
      assert.equal(initializerInodes[0], initializerInodes[1]);
      assert.equal(
        dockerExec(
          cid,
          'test "$(stat -c %U:%G:%a /var/lock/evcp-turn-reclaim.lock)" = root:root:600; stat -c %d:%i /var/lock/evcp-turn-reclaim.lock'
        ),
        initializerInodes[0]
      );
      await racingCommitter.releaseSnapshot(cid, winners[0].value);

      dockerExec(cid, "rm -f /workspace/node_modules");
      execFileSync("docker", ["restart", cid]);
      waitForWorkspace(cid);
      assert.equal(
        dockerExec(cid, "stat -c %d:%i /var/lock/evcp-turn-reclaim.lock"),
        initializerInodes[0]
      );

      dockerExec(
        cid,
        "rm -f /var/lock/evcp-turn-reclaim.lock; printf sentinel-unchanged > /tmp/evcp-lock-sentinel; ln -s /tmp/evcp-lock-sentinel /var/lock/evcp-turn-reclaim.lock"
      );
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim lock/i
      );
      dockerExec(
        cid,
        'test -L /var/lock/evcp-turn-reclaim.lock; test "$(cat /tmp/evcp-lock-sentinel)" = sentinel-unchanged'
      );

      dockerExec(
        cid,
        "rm -f /var/lock/evcp-turn-reclaim.lock; mkdir /var/lock/evcp-turn-reclaim.lock"
      );
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim lock/i
      );
      dockerExec(cid, "test -d /var/lock/evcp-turn-reclaim.lock");

      dockerExec(
        cid,
        "rmdir /var/lock/evcp-turn-reclaim.lock; mkfifo /var/lock/evcp-turn-reclaim.lock"
      );
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim lock/i
      );
      dockerExec(cid, "test -p /var/lock/evcp-turn-reclaim.lock");

      dockerExec(
        cid,
        "rm -f /var/lock/evcp-turn-reclaim.lock; : > /var/lock/evcp-turn-reclaim.lock; chown evcp:evcp /var/lock/evcp-turn-reclaim.lock; chmod 600 /var/lock/evcp-turn-reclaim.lock"
      );
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim lock/i
      );
      assert.equal(
        dockerExec(cid, "stat -c %U:%G:%a /var/lock/evcp-turn-reclaim.lock"),
        "evcp:evcp:600"
      );

      dockerExec(
        cid,
        "rm -f /var/lock/evcp-turn-reclaim.lock; : > /var/lock/evcp-turn-reclaim.lock; chmod 666 /var/lock/evcp-turn-reclaim.lock"
      );
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim lock/i
      );
      assert.equal(
        dockerExec(cid, "stat -c %U:%G:%a /var/lock/evcp-turn-reclaim.lock"),
        "root:root:666"
      );

      const parentMode = dockerExec(cid, "stat -Lc %a /var/lock");
      dockerExec(cid, "chmod g+w /var/lock; chmod 600 /var/lock/evcp-turn-reclaim.lock");
      await assert.rejects(
        () => baselineCommitter.prepare(cid),
        /invalid permanent workspace reclaim directory/i
      );
      assert.equal(
        dockerExec(cid, "stat -c %U:%G:%a /var/lock/evcp-turn-reclaim.lock"),
        "root:root:600"
      );
      dockerExec(cid, `chmod ${parentMode} /var/lock`);
    } finally {
      stopWorkspace(cid);
    }
  }
);

test(
  "prepare rejects a Git-ref hard link without changing either inode",
  { skip: !LIVE },
  async () => {
    const cid = startWorkspace();
    try {
      const committer = createContainerGitCommitter(createDockerSocketEngine());
      const baseline = await committer.prepare(cid);
      await committer.releaseSnapshot(cid, baseline);
      dockerExec(
        cid,
        'cd /workspace; ref=".git/$(git symbolic-ref HEAD)"; printf external-unchanged > /tmp/evcp-hardlink-external; ln "$ref" app/legacy-ref-copy.txt; stat -c "%d:%i:%u:%g:%a:%s" "$ref" > /tmp/evcp-ref-before; stat -c "%d:%i:%u:%g:%a:%s" app/legacy-ref-copy.txt > /tmp/evcp-source-before; cp "$ref" /tmp/evcp-ref-content-before; test "$(stat -c %i "$ref")" = "$(stat -c %i app/legacy-ref-copy.txt)"'
      );

      await assert.rejects(
        () => committer.prepare(cid),
        /supported source hard links are not supported/i
      );
      dockerExec(
        cid,
        [
          "set -eu",
          "cd /workspace",
          'ref=".git/$(git symbolic-ref HEAD)"',
          'test "$(stat -c "%d:%i:%u:%g:%a:%s" "$ref")" = "$(cat /tmp/evcp-ref-before)"',
          'test "$(stat -c "%d:%i:%u:%g:%a:%s" app/legacy-ref-copy.txt)" = "$(cat /tmp/evcp-source-before)"',
          'test "$(stat -c %i "$ref")" = "$(stat -c %i app/legacy-ref-copy.txt)"',
          'test "$(stat -c %U:%G "$ref")" = root:root',
          'test "$(stat -c %U:%G app/legacy-ref-copy.txt)" = root:root',
          'test "$(stat -c %U:%G /workspace)" = root:root',
          'cmp -s "$ref" /tmp/evcp-ref-content-before',
          "cmp -s app/legacy-ref-copy.txt /tmp/evcp-ref-content-before",
          'test "$(git rev-parse HEAD)" = "$(cat "$ref")"',
          'test "$(cat /tmp/evcp-hardlink-external)" = external-unchanged',
          'test -z "$(find /workspace -name ".evcp-inode.*" -print -quit)"',
          "test ! -e /var/lib/evcp/turn-snapshots/active.lock"
        ].join("; ")
      );
    } finally {
      stopWorkspace(cid);
    }
  }
);

test(
  "stable flock serializes migration and keeps its inode after holder crash",
  { skip: !LIVE },
  async () => {
    const cid = startWorkspace();
    try {
      const committer = createContainerGitCommitter(createDockerSocketEngine());
      assert.match(dockerExec(cid, "command -v flock"), /flock$/);
      const stableInode = dockerExec(
        cid,
        'test "$(stat -c %U:%G /var/lock/evcp-turn-reclaim.lock)" = root:root; test "$(stat -c %a /var/lock/evcp-turn-reclaim.lock)" = 600; printf stable-marker > /var/lock/evcp-turn-reclaim.lock; stat -c %d:%i /var/lock/evcp-turn-reclaim.lock'
      );
      const baseline = await committer.prepare(cid);
      await committer.releaseSnapshot(cid, baseline);
      assert.equal(dockerExec(cid, "stat -c %d:%i /var/lock/evcp-turn-reclaim.lock"), stableInode);
      assert.equal(dockerExec(cid, "cat /var/lock/evcp-turn-reclaim.lock"), "stable-marker");

      dockerExec(
        cid,
        "rm -f /var/lib/evcp/turn-snapshots/reclaim.lock; mkdir /var/lib/evcp/turn-snapshots/reclaim.lock; printf legacy > /var/lib/evcp/turn-snapshots/reclaim.lock/owner"
      );
      await assert.rejects(() => committer.prepare(cid), /legacy snapshot reclaim is active/i);
      dockerExec(
        cid,
        'touch -d "@$(( $(date +%s) - 10800 ))" /var/lib/evcp/turn-snapshots/reclaim.lock'
      );
      const migrations = await Promise.allSettled([
        committer.prepare(cid),
        committer.prepare(cid),
        committer.prepare(cid)
      ]);
      const migrationWinners = migrations.filter((result) => result.status === "fulfilled");
      const migrationLosers = migrations.filter((result) => result.status === "rejected");
      assert.equal(migrationWinners.length, 1);
      assert.equal(migrationLosers.length, 2);
      assert.ok(
        migrationLosers.every((result) => /snapshot lock is active/i.test(result.reason.message))
      );
      dockerExec(
        cid,
        `test ! -e /var/lib/evcp/turn-snapshots/reclaim.lock; test "$(stat -c %d:%i /var/lock/evcp-turn-reclaim.lock)" = "${stableInode}"; test "$(cat /var/lock/evcp-turn-reclaim.lock)" = stable-marker`
      );
      await committer.releaseSnapshot(cid, migrationWinners[0].value);

      const stale = await committer.prepare(cid);
      dockerExec(
        cid,
        'printf "%s\n" "$(( $(date +%s) - 10800 ))" > /var/lib/evcp/turn-snapshots/active.lock/timestamp'
      );
      const contenders = await Promise.allSettled([committer.prepare(cid), committer.prepare(cid)]);
      const winners = contenders.filter((result) => result.status === "fulfilled");
      const losers = contenders.filter((result) => result.status === "rejected");
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.match(losers[0].reason.message, /snapshot lock is active/i);
      await committer.releaseSnapshot(cid, winners[0].value);
      dockerExec(cid, `test ! -e /var/lib/evcp/turn-snapshots/snapshots/${stale}`);

      const holder = spawn("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "exec 9<>/var/lock/evcp-turn-reclaim.lock; flock -x 9; echo $$ > /tmp/evcp-flock-holder.pid; touch /tmp/evcp-flock-held; while :; do sleep 1; done"
      ]);
      dockerExec(
        cid,
        "i=0; until [ -f /tmp/evcp-flock-held ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
      );
      let settled = false;
      const afterCrashPromise = committer.prepare(cid).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(settled, false, "prepare must wait for the live kernel lock holder");
      dockerExec(cid, "kill -9 $(cat /tmp/evcp-flock-holder.pid)");
      const afterCrash = await afterCrashPromise;
      await committer.releaseSnapshot(cid, afterCrash);
      assert.equal(
        dockerExec(
          cid,
          'test -f /var/lock/evcp-turn-reclaim.lock; test "$(cat /var/lock/evcp-turn-reclaim.lock)" = stable-marker; stat -c %d:%i /var/lock/evcp-turn-reclaim.lock'
        ),
        stableInode
      );
      holder.kill();
    } finally {
      stopWorkspace(cid);
    }
  }
);
