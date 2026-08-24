import type { PrismaProjectFileRepository } from "./project-file-repository";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { deleteProjectResources } from "../project-deletion";

export interface ProjectFileObjectStorage {
  remove(bucket: string, objectKey: string): Promise<void>;
}

export async function deletePersistedProjectFiles(
  projectId: string,
  repository: PrismaProjectFileRepository,
  storage?: ProjectFileObjectStorage
): Promise<void> {
  const files = await repository.listAll(projectId);
  if (files.length === 0) return;
  if (!storage) {
    throw new Error("Project file object storage is unavailable; uploaded files were not deleted");
  }

  const failures: Error[] = [];
  for (const file of files) {
    try {
      await storage.remove(file.bucket, file.objectKey);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Uploaded file cleanup did not finish for project '${projectId}'`
    );
  }

  await repository.deleteProject(projectId);
}

export async function deletePersistedProjectResources(
  projectId: string,
  input: {
    workspace: WorkspaceOrchestrator;
    files?: PrismaProjectFileRepository;
    storage?: ProjectFileObjectStorage;
  },
  additionalCleanup?: () => Promise<void>
): Promise<void> {
  await deleteProjectResources([
    ...(additionalCleanup ? [additionalCleanup] : []),
    () => input.workspace.deleteWorkspace(projectId),
    ...(input.files
      ? [() => deletePersistedProjectFiles(projectId, input.files!, input.storage)]
      : [])
  ]);
}
