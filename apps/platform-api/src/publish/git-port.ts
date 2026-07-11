export interface GitPort {
  isWorkingTreeClean(projectId: string): Promise<boolean>;
  currentCommit(projectId: string): Promise<string>;
  checkoutCommit(projectId: string, commitSha: string): Promise<void>;
  listMigrationNames(projectId: string, commitSha: string): Promise<string[]>;
}

interface GitDockerEngine {
  execInContainer(
    containerId: string,
    cmd: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/**
 * Real GitPort that runs git inside the project's dev workspace container (mirrors how the
 * generation loop's action-runner shells into `/workspace`). `getDevContainerId` resolves the
 * running dev container for the project; git operates on the mounted `/workspace` checkout.
 */
export function createDockerGitPort(
  docker: GitDockerEngine,
  getDevContainerId: (projectId: string) => string | Promise<string>
): GitPort {
  const run = async (projectId: string, args: string[]) => {
    const containerId = await getDevContainerId(projectId);
    return docker.execInContainer(containerId, [
      "git",
      "-c",
      "safe.directory=/workspace",
      "-C",
      "/workspace",
      ...args
    ]);
  };
  const createInitialSnapshot = async (projectId: string) => {
    const containerId = await getDevContainerId(projectId);
    const script = [
      "git -c safe.directory=/workspace -C /workspace config user.email >/dev/null 2>&1 || git -c safe.directory=/workspace -C /workspace config user.email 'ai@evcp.local'",
      "git -c safe.directory=/workspace -C /workspace config user.name >/dev/null 2>&1 || git -c safe.directory=/workspace -C /workspace config user.name 'EVCP AI'",
      "git -c safe.directory=/workspace -C /workspace add -A",
      "git -c safe.directory=/workspace -C /workspace commit --allow-empty -q -m 'EVCP: initial workspace snapshot'"
    ].join(" && ");
    const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
    if (result.exitCode !== 0) {
      throw new Error(
        `git initial snapshot failed (exit ${result.exitCode}): ${result.stderr.trim()}`
      );
    }
  };
  return {
    async isWorkingTreeClean(projectId) {
      const result = await run(projectId, ["status", "--porcelain"]);
      if (result.exitCode !== 0) {
        throw new Error(`git status failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
      }
      return result.stdout.trim().length === 0;
    },
    async currentCommit(projectId) {
      const result = await run(projectId, ["rev-parse", "HEAD"]);
      if (result.exitCode !== 0) {
        const noCommitYet =
          /needed a single revision|unknown revision|does not have any commits yet/i.test(
            result.stderr
          );
        if (!noCommitYet) {
          throw new Error(
            `git rev-parse failed (exit ${result.exitCode}): ${result.stderr.trim()}`
          );
        }
        await createInitialSnapshot(projectId);
        const initialized = await run(projectId, ["rev-parse", "HEAD"]);
        if (initialized.exitCode !== 0) {
          throw new Error(
            `git rev-parse failed after initial snapshot (exit ${initialized.exitCode}): ${initialized.stderr.trim()}`
          );
        }
        return initialized.stdout.trim();
      }
      return result.stdout.trim();
    },
    async checkoutCommit(projectId, commitSha) {
      const result = await run(projectId, ["checkout", commitSha]);
      if (result.exitCode !== 0) {
        throw new Error(
          `git checkout ${commitSha} failed (exit ${result.exitCode}): ${result.stderr.trim()}`
        );
      }
    },
    async listMigrationNames(projectId, commitSha) {
      // List migration directory entries at the target commit (prisma/migrations convention).
      const result = await run(projectId, [
        "ls-tree",
        "--name-only",
        `${commitSha}:prisma/migrations`
      ]);
      if (result.exitCode !== 0) {
        // No migrations directory at that commit → treat as no migrations.
        return [];
      }
      return result.stdout
        .split("\n")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
    }
  };
}

interface MemoryRepo {
  clean: boolean;
  head: string;
  migrationNames: Record<string, string[]>;
  checkouts?: string[];
}

export function createMemoryGitPort(
  initial: Record<string, MemoryRepo> = {}
): GitPort & { state: { projects: Record<string, MemoryRepo> } } {
  const state = { projects: initial };
  const repo = (projectId: string): MemoryRepo => {
    const found = state.projects[projectId];
    if (!found) {
      throw new Error(`no git repo for project '${projectId}'`);
    }
    return found;
  };
  return {
    state,
    async isWorkingTreeClean(projectId) {
      return repo(projectId).clean;
    },
    async currentCommit(projectId) {
      return repo(projectId).head;
    },
    async checkoutCommit(projectId, commitSha) {
      const r = repo(projectId);
      r.head = commitSha;
      r.checkouts = [...(r.checkouts ?? []), commitSha];
    },
    async listMigrationNames(projectId, commitSha) {
      return repo(projectId).migrationNames[commitSha] ?? [];
    }
  };
}
