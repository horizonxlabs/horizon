import type { WorkspaceContainerRecord } from "@evcp/types";
import { workspacePhysicalKey } from "./runtime-location";

/** Local publication ordering is independent of asynchronous database lease responses. */
export function createWorkspaceRuntimeCache() {
  const records = new Map<string, WorkspaceContainerRecord>();
  const revisions = new Map<string, { value: bigint; readers: number }>();
  let sequence = 0n;
  const revisionFor = (projectId: string) => {
    let revision = revisions.get(projectId);
    if (!revision) {
      revision = { value: sequence, readers: 0 };
      revisions.set(projectId, revision);
    }
    return revision;
  };
  const forgetDeleted = (projectId: string) => {
    if (!records.has(projectId) && revisions.get(projectId)?.readers === 0)
      revisions.delete(projectId);
  };
  const set = (record: WorkspaceContainerRecord) => {
    revisionFor(record.projectId).value = ++sequence;
    records.set(record.projectId, record);
  };
  return {
    records: records as ReadonlyMap<string, WorkspaceContainerRecord>,
    set,
    findByResourceKey(resourceKey: string): WorkspaceContainerRecord | null {
      for (const record of records.values()) {
        if (workspacePhysicalKey(record) === resourceKey) return record;
      }
      return null;
    },
    invalidate(projectId: string) {
      revisionFor(projectId).value = ++sequence;
      forgetDeleted(projectId);
    },
    delete(projectId: string) {
      revisionFor(projectId).value = ++sequence;
      records.delete(projectId);
      forgetDeleted(projectId);
    },
    capture(projectId: string) {
      const revision = revisionFor(projectId);
      const expected = revision.value;
      revision.readers += 1;
      let active = true;
      return {
        publish(record: WorkspaceContainerRecord): boolean {
          if (!active || record.projectId !== projectId || revision.value !== expected)
            return false;
          set(record);
          return true;
        },
        release() {
          if (!active) return;
          active = false;
          revision.readers -= 1;
          // Retain deletion revisions only while an older publication can still arrive.
          forgetDeleted(projectId);
        }
      };
    }
  };
}

export type WorkspaceRuntimeCache = ReturnType<typeof createWorkspaceRuntimeCache>;
