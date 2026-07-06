export interface GitPort {
  isWorkingTreeClean(projectId: string): Promise<boolean>;
  currentCommit(projectId: string): Promise<string>;
  checkoutCommit(projectId: string, commitSha: string): Promise<void>;
  listMigrationNames(projectId: string, commitSha: string): Promise<string[]>;
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
