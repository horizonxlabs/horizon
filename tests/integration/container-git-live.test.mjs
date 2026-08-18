import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";
const IMAGE = process.env.EVCP_WORKSPACE_IMAGE ?? "evcp/workspace-next:1";

test(
  "commits real changes inside a throwaway container and returns a sha",
  { skip: !LIVE },
  async () => {
    // boot a throwaway workspace container
    const cid = execFileSync("docker", ["run", "-d", "--rm", IMAGE]).toString().trim();
    try {
      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "i=0; until [ -f /workspace/package.json ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
      ]);
      const committer = createContainerGitCommitter(createDockerSocketEngine());
      const token = await committer.prepare(cid);
      execFileSync("docker", [
        "exec",
        cid,
        "su",
        "-s",
        "/bin/sh",
        "evcp",
        "-c",
        "echo first > /workspace/app/first.txt"
      ]);
      const sha1 = await committer.commit(cid, "AI: initial generated file");
      assert.match(sha1, /^[0-9a-f]{7,40}$/, "expected a git sha");

      // write a file then commit again — new sha
      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "echo hello > /workspace/app/generated.txt"
      ]);
      const sha2 = await committer.commit(cid, "AI: add generated.txt");
      assert.match(sha2, /^[0-9a-f]{7,40}$/);
      assert.notEqual(sha1, sha2, "a new commit should have a different sha");
      await committer.releaseSnapshot(cid, token);
    } finally {
      execFileSync("docker", ["rm", "-f", cid]);
    }
  }
);

test(
  "evcp cannot replace Git metadata but can manage owned workspace entries",
  { skip: !LIVE },
  async () => {
    const cid = execFileSync("docker", ["run", "-d", "--rm", IMAGE]).toString().trim();
    try {
      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "i=0; until [ -f /workspace/package.json ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
      ]);
      const committer = createContainerGitCommitter(createDockerSocketEngine());
      const token = await committer.prepare(cid);

      execFileSync("docker", [
        "exec",
        cid,
        "su",
        "-s",
        "/bin/sh",
        "evcp",
        "-c",
        "rm -rf /workspace/.git 2>/dev/null || true; mv /workspace/.git /workspace/.git-moved 2>/dev/null || true; git -C /workspace config user.name attacker 2>/dev/null || true; touch /workspace/.git/hooks/evil 2>/dev/null || true; test -d /workspace/.git && test ! -e /workspace/.git-moved && test ! -e /workspace/.git/hooks/evil"
      ]);
      execFileSync("docker", [
        "exec",
        cid,
        "su",
        "-s",
        "/bin/sh",
        "evcp",
        "-c",
        "set -e; echo safe > /workspace/app/owned.txt; rm -f /workspace/node_modules; ln -s /opt/evcp-template/node_modules /workspace/node_modules"
      ]);

      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        'timeout 3 /usr/local/bin/workspace-entrypoint >/tmp/restart.log 2>&1 || true; test "$(stat -c %U:%G /workspace)" = root:root; test "$(stat -c %a /workspace)" = 1777; test "$(stat -c %U:%G /workspace/.git)" = root:root; test "$(stat -c %a /workspace/.git)" = 700; test "$(git -C /workspace config --get user.name)" != attacker; test -f /workspace/app/owned.txt; test -L /workspace/node_modules'
      ]);
      await committer.releaseSnapshot(cid, token);
    } finally {
      execFileSync("docker", ["rm", "-f", cid]);
    }
  }
);

test(
  "legacy Git executable metadata is neutralized before root Git in a real container",
  { skip: !LIVE },
  async () => {
    const cid = execFileSync("docker", ["run", "-d", "--rm", IMAGE]).toString().trim();
    try {
      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "i=0; until [ -f /workspace/package.json ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
      ]);
      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        [
          "set -eu",
          "cd /workspace",
          "rm -rf .git",
          "git init -q",
          'git config user.email "legacy@example.test"',
          'git config user.name "Legacy"',
          "git add -A",
          'git commit -q -m "legacy base"',
          "mkdir -p /tmp/evcp-legacy-hooks /tmp/evcp-legacy-objects .git/objects/info .git/worktrees/legacy",
          `printf '%s\n' '#!/bin/sh' 'printf fired >> /tmp/evcp-git-payload-fired' 'exit 1' > /tmp/evcp-git-payload.sh`,
          "chmod 755 /tmp/evcp-git-payload.sh",
          "cp /tmp/evcp-git-payload.sh .git/hooks/pre-commit",
          "cp /tmp/evcp-git-payload.sh /tmp/evcp-legacy-hooks/pre-commit",
          `printf '%s\n' '[filter "evil"]' 'clean = /tmp/evcp-git-payload.sh' 'process = /tmp/evcp-git-payload.sh' '[diff "evil"]' 'command = /tmp/evcp-git-payload.sh' 'textconv = /tmp/evcp-git-payload.sh' '[credential]' 'helper = /tmp/evcp-git-payload.sh' '[url "file:///outside/"]' 'insteadOf = safe:' '[remote "origin"]' 'url = safe:repo' > /tmp/evcp-legacy.config`,
          "git config --add include.path /tmp/evcp-legacy.config",
          "git config core.hooksPath /tmp/evcp-legacy-hooks",
          `printf '%s\n' '*.tsx filter=evil diff=evil' > .gitattributes`,
          `printf '%s\n' '/tmp/evcp-legacy-objects' > .git/objects/info/alternates`,
          `printf '%s\n' '/tmp/evcp-legacy-worktree/.git' > .git/worktrees/legacy/gitdir`,
          `printf '%s\n' '/tmp/evcp-legacy-common' > .git/commondir`
        ].join(" && ")
      ]);
      const legacyHead = execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "rm -f /workspace/.git/commondir; git -C /workspace rev-parse HEAD; printf '%s\\n' '/tmp/evcp-legacy-common' > /workspace/.git/commondir"
      ])
        .toString()
        .trim();
      const committer = createContainerGitCommitter(createDockerSocketEngine());

      const token = await committer.prepare(cid);
      execFileSync("docker", [
        "exec",
        cid,
        "su",
        "-s",
        "/bin/sh",
        "evcp",
        "-c",
        "echo safe-change > /workspace/app/legacy-upgrade.txt"
      ]);
      const committed = await committer.commit(cid, "AI: sanitize legacy repository");

      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        [
          "set -eu",
          "test ! -e /tmp/evcp-git-payload-fired",
          'test "$(git -C /workspace rev-parse HEAD^)" = "' + legacyHead + '"',
          'test -z "$(find /workspace/.git/hooks -mindepth 1 -print -quit)"',
          "test ! -e /workspace/.git/objects/info/alternates",
          "test ! -e /workspace/.git/commondir",
          "test ! -e /workspace/.git/worktrees",
          `test "$(git -C /workspace config --local --name-only --list | LC_ALL=C sort | tr '\n' ' ')" = "core.bare core.filemode core.logallrefupdates core.repositoryformatversion user.email user.name "`
        ].join(" && ")
      ]);
      await committer.releaseSnapshot(cid, token);

      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "rm -rf /tmp/evcp-external-git; mv /workspace/.git /tmp/evcp-external-git; printf '%s\\n' 'gitdir: /tmp/evcp-external-git' > /workspace/.git"
      ]);
      await assert.rejects(() => committer.prepare(cid), /refusing non-directory.*\.git/i);
      assert.equal(
        execFileSync("docker", [
          "exec",
          cid,
          "git",
          "--git-dir=/tmp/evcp-external-git",
          "rev-parse",
          "HEAD"
        ])
          .toString()
          .trim(),
        committed
      );

      execFileSync("docker", [
        "exec",
        cid,
        "sh",
        "-c",
        "rm /workspace/.git; mv /tmp/evcp-external-git /workspace/.git; printf keep > /tmp/evcp-external-target; ln -s /tmp/evcp-external-target /workspace/.git/hooks/legacy-link"
      ]);
      await assert.rejects(() => committer.prepare(cid), /refusing symlink inside.*\.git/i);
      assert.equal(
        execFileSync("docker", ["exec", cid, "cat", "/tmp/evcp-external-target"]).toString().trim(),
        "keep"
      );
    } finally {
      execFileSync("docker", ["rm", "-f", cid]);
    }
  }
);
