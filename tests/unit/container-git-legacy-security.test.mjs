import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";

const execFileAsync = promisify(execFile);

async function legacyGitWorkspace(t) {
  const workspace = await mkdtemp(join(tmpdir(), "evcp-container-git-legacy-"));
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
  return { workspace, git, committer: createContainerGitCommitter(docker) };
}

test("every trusted Git invocation uses a scrubbed environment with hooks disabled", async () => {
  const calls = [];
  const committer = createContainerGitCommitter({
    async execInContainer(_containerId, command) {
      calls.push(command);
      return { stdout: "abc123\n", stderr: "", exitCode: 0 };
    }
  });

  await committer.commit("c1", "AI: hardened commit");

  const script = calls[0].at(-1);
  assert.match(script, /commit --no-verify/);
  assert.match(script, /env -i/);
  assert.match(script, /HOME=\/var\/lib\/evcp\/turn-snapshots\/git-home/);
  assert.match(script, /GIT_CONFIG_NOSYSTEM=1/);
  assert.match(script, /GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(script, /GIT_ATTR_NOSYSTEM=1/);
  assert.doesNotMatch(
    script.replaceAll(
      /env -i PATH=[^ ]+ HOME=[^ ]+ GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_SYSTEM=\/dev\/null GIT_CONFIG_GLOBAL=\/dev\/null GIT_ATTR_NOSYSTEM=1(?: GIT_[A-Z_]+=(?:"[^"]*"|[^ ]+))* git -c safe\.directory=\/workspace -c core\.hooksPath=\/dev\/null/g,
      ""
    ),
    /(?:^|[;&|]\s*)git\s/,
    "every trusted Git invocation must use the scrubbed environment and disabled hooks"
  );
});

test("prepare rejects a supported source hard link without modifying either pathname", async (t) => {
  const { workspace, git, committer } = await legacyGitWorkspace(t);
  const symbolicHead = await git("symbolic-ref", "HEAD");
  const gitRef = join(workspace, ".git", symbolicHead);
  const sourceLink = join(workspace, "app/legacy-ref-copy.txt");
  const refContent = await readFile(gitRef, "utf8");
  await link(gitRef, sourceLink);
  const linkedRefBefore = await stat(gitRef);
  const linkedSourceBefore = await stat(sourceLink);
  assert.equal(linkedRefBefore.ino, linkedSourceBefore.ino);

  await assert.rejects(
    () => committer.prepare("c1"),
    /supported source hard links are not supported/i
  );

  const protectedRef = await stat(gitRef);
  const rejectedSource = await stat(sourceLink);
  assert.equal(protectedRef.ino, linkedRefBefore.ino);
  assert.equal(rejectedSource.ino, linkedSourceBefore.ino);
  assert.equal(protectedRef.ino, rejectedSource.ino);
  assert.equal(protectedRef.mode, linkedRefBefore.mode);
  assert.equal(rejectedSource.mode, linkedSourceBefore.mode);
  assert.equal(protectedRef.uid, linkedRefBefore.uid);
  assert.equal(rejectedSource.uid, linkedSourceBefore.uid);
  assert.equal(await readFile(gitRef, "utf8"), refContent);
  assert.equal(await readFile(sourceLink, "utf8"), refContent);
  assert.equal(await git("rev-parse", "HEAD"), refContent.trim());
  assert.equal(
    (await readdir(join(workspace, "app"))).some((entry) => entry.startsWith(".evcp-inode.")),
    false
  );
});

test("prepare rejects source-to-source hard links without modifying them", async (t) => {
  const { workspace, committer } = await legacyGitWorkspace(t);
  const original = join(workspace, "app/page.tsx");
  const linked = join(workspace, "app/page copy.tsx");
  await link(original, linked);
  const before = await stat(original);

  await assert.rejects(
    () => committer.prepare("c1"),
    /supported source hard links are not supported/i
  );

  assert.equal((await stat(original)).ino, before.ino);
  assert.equal((await stat(linked)).ino, before.ino);
  assert.equal(await readFile(linked, "utf8"), "original\n");
});

test("prepare rejects a legacy gitdir file before Git can follow it outside the workspace", async (t) => {
  const { workspace, committer } = await legacyGitWorkspace(t);
  const externalGit = `${workspace}-external-git`;
  t.after(() => rm(externalGit, { recursive: true, force: true }));
  await execFileAsync("mv", [join(workspace, ".git"), externalGit]);
  await writeFile(join(workspace, ".git"), `gitdir: ${externalGit}\n`);
  const headBefore = (
    await execFileAsync("git", ["--git-dir", externalGit, "rev-parse", "HEAD"])
  ).stdout.trim();

  await assert.rejects(() => committer.prepare("c1"), /refusing non-directory.*\.git/i);

  assert.equal(
    (await execFileAsync("git", ["--git-dir", externalGit, "rev-parse", "HEAD"])).stdout.trim(),
    headBefore
  );
});

test("prepare rejects a symlinked Git directory without traversing it", async (t) => {
  const { workspace, committer } = await legacyGitWorkspace(t);
  const externalGit = `${workspace}-symlinked-git`;
  t.after(() => rm(externalGit, { recursive: true, force: true }));
  await execFileAsync("mv", [join(workspace, ".git"), externalGit]);
  await symlink(externalGit, join(workspace, ".git"));
  const headBefore = (
    await execFileAsync("git", ["--git-dir", externalGit, "rev-parse", "HEAD"])
  ).stdout.trim();

  await assert.rejects(() => committer.prepare("c1"), /refusing symlinked.*\.git/i);

  assert.equal(
    (await execFileAsync("git", ["--git-dir", externalGit, "rev-parse", "HEAD"])).stdout.trim(),
    headBefore
  );
});

test("prepare rejects symlinks inside Git metadata without dereferencing their targets", async (t) => {
  const { workspace, committer } = await legacyGitWorkspace(t);
  const external = `${workspace}-external-metadata-target`;
  t.after(() => rm(external, { recursive: true, force: true }));
  await mkdir(external, { recursive: true });
  await writeFile(join(external, "keep.txt"), "outside stays intact\n");
  await symlink(join(external, "keep.txt"), join(workspace, ".git/hooks/legacy-link"));

  await assert.rejects(() => committer.prepare("c1"), /refusing symlink inside.*\.git/i);

  assert.equal(await readFile(join(external, "keep.txt"), "utf8"), "outside stays intact\n");
});

test("legacy executable Git metadata is sanitized before trusted Git preserves history", async (t) => {
  const { workspace, git, committer } = await legacyGitWorkspace(t);
  const external = `${workspace}-legacy-git-payloads`;
  const marker = join(external, "executed");
  const payload = join(external, "payload.sh");
  const includedConfig = join(external, "included.config");
  const externalHooks = join(external, "hooks");
  t.after(() => rm(external, { recursive: true, force: true }));
  await mkdir(externalHooks, { recursive: true });
  await writeFile(payload, `#!/bin/sh\nprintf executed >> "${marker}"\nexit 1\n`);
  await chmod(payload, 0o755);
  await writeFile(join(workspace, ".git/hooks/pre-commit"), `#!/bin/sh\n"${payload}"\n`);
  await chmod(join(workspace, ".git/hooks/pre-commit"), 0o755);
  await writeFile(join(externalHooks, "pre-commit"), `#!/bin/sh\n"${payload}"\n`);
  await chmod(join(externalHooks, "pre-commit"), 0o755);
  await writeFile(
    includedConfig,
    [
      '[filter "evil"]',
      `\tclean = ${payload}`,
      `\tprocess = ${payload}`,
      '[diff "evil"]',
      `\tcommand = ${payload}`,
      `\ttextconv = ${payload}`,
      "[credential]",
      `\thelper = ${payload}`,
      '[url "file:///outside/"]',
      "\tinsteadOf = safe:",
      '[remote "origin"]',
      "\turl = safe:repo"
    ].join("\n") + "\n"
  );
  await execFileAsync("git", ["-C", workspace, "config", "--add", "include.path", includedConfig]);
  await execFileAsync("git", ["-C", workspace, "config", "core.hooksPath", externalHooks]);
  await writeFile(join(workspace, ".gitattributes"), "*.tsx filter=evil diff=evil\n");
  await mkdir(join(workspace, ".git/objects/info"), { recursive: true });
  await writeFile(join(workspace, ".git/objects/info/alternates"), `${external}/objects\n`);
  await mkdir(join(workspace, ".git/worktrees/legacy"), { recursive: true });
  await writeFile(join(workspace, ".git/worktrees/legacy/gitdir"), `${external}/worktree/.git\n`);
  const headBefore = await git("rev-parse", "HEAD");

  const snapshot = await committer.prepare("c1");

  assert.equal(await git("rev-parse", "HEAD"), headBefore);
  await assert.rejects(readFile(marker, "utf8"), /ENOENT/);
  assert.deepEqual((await git("config", "--local", "--name-only", "--list")).split("\n").sort(), [
    "core.bare",
    "core.filemode",
    "core.logallrefupdates",
    "core.repositoryformatversion",
    "user.email",
    "user.name"
  ]);
  assert.deepEqual(await readdir(join(workspace, ".git/hooks")), []);
  await assert.rejects(readFile(join(workspace, ".git/objects/info/alternates"), "utf8"), /ENOENT/);
  await assert.rejects(stat(join(workspace, ".git/worktrees")), /ENOENT/);

  await writeFile(join(workspace, ".git/hooks/pre-commit"), `#!/bin/sh\n"${payload}"\n`);
  await chmod(join(workspace, ".git/hooks/pre-commit"), 0o755);
  await execFileAsync("git", ["-C", workspace, "config", "--add", "include.path", includedConfig]);
  await execFileAsync("git", ["-C", workspace, "config", "core.hooksPath", externalHooks]);
  await writeFile(join(workspace, ".git/objects/info/alternates"), `${external}/objects\n`);
  await writeFile(join(workspace, ".git/commondir"), `${external}/common\n`);
  await writeFile(join(workspace, "app/page.tsx"), "safe change\n");
  assert.equal(await committer.hasChanges("c1", snapshot), true);

  await writeFile(join(workspace, ".git/hooks/pre-commit"), `#!/bin/sh\n"${payload}"\n`);
  await chmod(join(workspace, ".git/hooks/pre-commit"), 0o755);
  await execFileAsync("git", ["-C", workspace, "config", "--add", "include.path", includedConfig]);
  await execFileAsync("git", ["-C", workspace, "config", "core.hooksPath", externalHooks]);
  await writeFile(join(workspace, ".git/objects/info/alternates"), `${external}/objects\n`);
  await writeFile(join(workspace, ".git/commondir"), `${external}/common\n`);
  const committed = await committer.commit("c1", "AI: safe legacy upgrade");
  assert.equal(await git("rev-parse", `${committed}^`), headBefore);
  await assert.rejects(readFile(marker, "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(workspace, ".git/commondir"), "utf8"), /ENOENT/);

  await writeFile(join(workspace, ".git/hooks/pre-commit"), `#!/bin/sh\n"${payload}"\n`);
  await chmod(join(workspace, ".git/hooks/pre-commit"), 0o755);
  await execFileAsync("git", ["-C", workspace, "config", "--add", "include.path", includedConfig]);
  await execFileAsync("git", ["-C", workspace, "config", "core.hooksPath", externalHooks]);
  await writeFile(join(workspace, ".git/objects/info/alternates"), `${external}/objects\n`);
  await writeFile(join(workspace, ".git/commondir"), `${external}/common\n`);
  await writeFile(join(workspace, "app/page.tsx"), "broken after commit\n");
  await committer.restoreSnapshot("c1", snapshot);
  assert.equal(await readFile(join(workspace, "app/page.tsx"), "utf8"), "original\n");
  await assert.rejects(readFile(marker, "utf8"), /ENOENT/);
  await committer.releaseSnapshot("c1", snapshot);
});

test("public restore sanitizes a legacy repository before reading its target commit", async (t) => {
  const { workspace, git, committer } = await legacyGitWorkspace(t);
  const external = `${workspace}-restore-payload`;
  const marker = join(external, "executed");
  const payload = join(external, "payload.sh");
  const config = join(external, "included.config");
  t.after(() => rm(external, { recursive: true, force: true }));
  await mkdir(external, { recursive: true });
  await writeFile(payload, `#!/bin/sh\nprintf executed >> "${marker}"\nexit 1\n`);
  await chmod(payload, 0o755);
  await writeFile(join(workspace, ".gitattributes"), "*.tsx filter=evil\n");
  await execFileAsync("git", ["-C", workspace, "add", ".gitattributes"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-q", "-m", "attributes"]);
  const target = await git("rev-parse", "HEAD");
  await writeFile(
    config,
    `[filter "evil"]\n\tprocess = ${payload}\n\tsmudge = ${payload}\n[core]\n\thooksPath = ${external}\n`
  );
  await execFileAsync("git", ["-C", workspace, "config", "--add", "include.path", config]);
  await mkdir(join(workspace, ".git/objects/info"), { recursive: true });
  await writeFile(join(workspace, ".git/objects/info/alternates"), `${external}/objects\n`);
  await writeFile(join(workspace, ".git/commondir"), `${external}/common\n`);
  await writeFile(join(workspace, "app/page.tsx"), "dirty\n");

  await committer.restore("c1", target);

  assert.equal(await git("rev-parse", "HEAD"), target);
  assert.equal(await readFile(join(workspace, "app/page.tsx"), "utf8"), "original\n");
  await assert.rejects(readFile(marker, "utf8"), /ENOENT/);
});
