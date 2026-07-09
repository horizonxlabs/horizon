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
  getDevContainerId: (projectId: string) => string
): GitPort {
  const run = async (projectId: string, args: string[]) => {
    const containerId = getDevContainerId(projectId);
    return docker.execInContainer(containerId, ["git", "-C", "/workspace", ...args]);
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
        throw new Error(`git rev-parse failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
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
    },
  };
}
