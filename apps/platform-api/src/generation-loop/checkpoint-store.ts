import type { CodeCheckpoint } from "@evcp/types";

export interface CheckpointStore {
  createCheckpoint(input: { projectId: string; tag: string; commitSha: string; label: string }): CodeCheckpoint;
  listCheckpoints(projectId: string): CodeCheckpoint[];
}

export function createMemoryCheckpointStore(): CheckpointStore {
  const byProject = new Map<string, CodeCheckpoint[]>();
  let counter = 0;
  return {
    createCheckpoint(input) {
      counter += 1;
      const checkpoint: CodeCheckpoint = {
        id: `chk-${counter}`,
        projectId: input.projectId,
        tag: input.tag,
        commitSha: input.commitSha,
        label: input.label,
        createdAt: new Date().toISOString()
      };
      const list = byProject.get(input.projectId) ?? [];
      list.push(checkpoint);
      byProject.set(input.projectId, list);
      return checkpoint;
    },
    listCheckpoints(projectId) {
      return [...(byProject.get(projectId) ?? [])];
    }
  };
}
