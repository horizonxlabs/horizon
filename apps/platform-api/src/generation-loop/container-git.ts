import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

export interface ContainerGitCommitter {
  prepare(containerId: string): Promise<string>;
  hasChanges(containerId: string): Promise<boolean>;
  validate(containerId: string): Promise<void>;
  restore(containerId: string, commitSha: string): Promise<void>;
  commit(containerId: string, message: string): Promise<string>;
}

// Single-quote-escape a string for safe embedding inside a `sh -c '...'` double-quoted -m argument.
function shellEscapeDouble(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

export function createContainerGitCommitter(docker: DockerEngine): ContainerGitCommitter {
  const g = "git -c safe.directory=/workspace";
  const run = async (containerId: string, script: string, operation: string) => {
    const result = await docker.execInContainer(containerId, [
      "su",
      "-s",
      "/bin/sh",
      "evcp",
      "-c",
      script
    ]);
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(-4000);
      throw new Error(`${operation} failed (exit ${result.exitCode}): ${detail}`);
    }
    return result.stdout.trim();
  };
  const repairOwnership = async (containerId: string) => {
    const result = await docker.execInContainer(containerId, [
      "sh",
      "-c",
      "find /workspace -xdev ! -user evcp -exec chown -h evcp:evcp {} +"
    ]);
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(-4000);
      throw new Error(`workspace ownership repair failed (exit ${result.exitCode}): ${detail}`);
    }
  };
  return {
    async prepare(containerId) {
      await repairOwnership(containerId);
      const script = [
        "cd /workspace",
        `${g} rev-parse --is-inside-work-tree >/dev/null 2>&1 || ${g} init -q`,
        `${g} config user.email >/dev/null 2>&1 || ${g} config user.email "ai@evcp.local"`,
        `${g} config user.name >/dev/null 2>&1 || ${g} config user.name "EVCP AI"`,
        `if ! ${g} rev-parse --verify HEAD >/dev/null 2>&1; then ${g} add -A && ${g} commit --allow-empty -q -m "EVCP initial workspace"; fi`,
        `${g} rev-parse HEAD`
      ].join(" && ");
      return run(containerId, script, "workspace prepare");
    },
    async hasChanges(containerId) {
      const status = await run(
        containerId,
        `cd /workspace && ${g} status --porcelain --untracked-files=normal`,
        "workspace status"
      );
      return status.length > 0;
    },
    async validate(containerId) {
      const script = [
        'validation_dir="$(mktemp -d /tmp/evcp-validation.XXXXXX)"',
        `trap 'rm -rf "$validation_dir"' EXIT HUP INT TERM`,
        'tar -C /workspace --exclude=.git --exclude=node_modules --exclude=.next --exclude=.next-* -cf - . | tar -C "$validation_dir" -xf -',
        'ln -s /workspace/node_modules "$validation_dir/node_modules"',
        'cd "$validation_dir"',
        "EVCP_VALIDATION_DIST_DIR=.next ./node_modules/.bin/next build"
      ].join(" && ");
      await run(containerId, script, "workspace validation");
    },
    async restore(containerId, commitSha) {
      if (!/^[0-9a-f]{4,64}$/i.test(commitSha)) throw new Error("invalid workspace commit SHA");
      await run(
        containerId,
        `cd /workspace && ${g} reset --hard ${commitSha} >/dev/null && ${g} clean -fd >/dev/null`,
        "workspace restore"
      );
    },
    async commit(containerId: string, message: string): Promise<string> {
      const safe = shellEscapeDouble(message);
      // `-c safe.directory=/workspace` on every call so git never aborts with "detected dubious
      // ownership" (exit 128) when the mounted /workspace is owned by a different uid than the exec
      // user — which varies by host. Mirrors the publish GitPort, which already guards this.
      // Idempotent init + identity, stage all, commit, print HEAD.
      const script = [
        "cd /workspace",
        `${g} rev-parse --is-inside-work-tree >/dev/null 2>&1 || ${g} init -q`,
        `${g} config user.email >/dev/null 2>&1 || ${g} config user.email "ai@evcp.local"`,
        `${g} config user.name >/dev/null 2>&1 || ${g} config user.name "EVCP AI"`,
        `${g} add -A`,
        `${g} commit -q -m "${safe}"`,
        `${g} rev-parse HEAD`
      ].join(" && ");

      return run(containerId, script, "git commit");
    }
  };
}
