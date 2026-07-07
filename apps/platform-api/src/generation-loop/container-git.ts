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
      // Idempotent init + identity, stage all, allow-empty commit, print HEAD.
      const script = [
        "cd /workspace",
        "git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -q",
        'git config user.email >/dev/null 2>&1 || git config user.email "ai@evcp.local"',
        'git config user.name >/dev/null 2>&1 || git config user.name "EVCP AI"',
        "git add -A",
        `git commit --allow-empty -q -m "${safe}"`,
        "git rev-parse HEAD"
      ].join(" && ");

      const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
      if (result.exitCode !== 0) {
        throw new Error(`git commit failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
      }
      return result.stdout.trim();
    }
  };
}
