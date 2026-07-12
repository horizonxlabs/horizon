import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

export interface ContainerGitCommitter {
  commit(containerId: string, message: string): Promise<string>;
}

// Single-quote-escape a string for safe embedding inside a `sh -c '...'` double-quoted -m argument.
function shellEscapeDouble(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

export function createContainerGitCommitter(docker: DockerEngine): ContainerGitCommitter {
  return {
    async commit(containerId: string, message: string): Promise<string> {
      const safe = shellEscapeDouble(message);
      // `-c safe.directory=/workspace` on every call so git never aborts with "detected dubious
      // ownership" (exit 128) when the mounted /workspace is owned by a different uid than the exec
      // user — which varies by host. Mirrors the publish GitPort, which already guards this.
      const g = "git -c safe.directory=/workspace";
      // Idempotent init + identity, stage all, allow-empty commit, print HEAD.
      const script = [
        "cd /workspace",
        `${g} rev-parse --is-inside-work-tree >/dev/null 2>&1 || ${g} init -q`,
        `${g} config user.email >/dev/null 2>&1 || ${g} config user.email "ai@evcp.local"`,
        `${g} config user.name >/dev/null 2>&1 || ${g} config user.name "EVCP AI"`,
        `${g} add -A`,
        `${g} commit --allow-empty -q -m "${safe}"`,
        `${g} rev-parse HEAD`
      ].join(" && ");

      const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
      if (result.exitCode !== 0) {
        throw new Error(`git commit failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
      }
      return result.stdout.trim();
    }
  };
}
