import type { PrismaProjectFileRepository } from "./project-file-repository";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { deleteProjectResources } from "../project-deletion";
import { projectFileBucketName } from "../workspace-orchestrator/minio-object-storage";

export interface ProjectFileObjectStorage {
  remove(bucket: string, objectKey: string): Promise<void>;
  revokeBucket?(bucket: string, objectKeys: string[]): Promise<void>;
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

  const sweep = async () => {
    const failures: Error[] = [];
    const filesByBucket = new Map<string, typeof files>();
    for (const file of files) {
      const bucketFiles = filesByBucket.get(file.bucket) ?? [];
      bucketFiles.push(file);
      filesByBucket.set(file.bucket, bucketFiles);
    }
    for (const [bucket, bucketFiles] of filesByBucket) {
      const operations = storage.revokeBucket && bucket === projectFileBucketName(projectId)
        ? [() => storage.revokeBucket!(bucket, bucketFiles.map((file) => file.objectKey))]
        : bucketFiles.map((file) => () => storage.remove(bucket, file.objectKey));
      for (const operation of operations) {
        try {
          await operation();
        } catch (error) {
          failures.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Uploaded file cleanup did not finish for project '${projectId}'`
      );
    }
  };

  await sweep();

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
