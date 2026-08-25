import type { PrismaProjectFileRepository } from "./project-file-repository";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import { deleteProjectResources } from "../project-deletion";
import { projectFileBucketName } from "../workspace-orchestrator/minio-object-storage";
import type { ProjectDeletionFence } from "../project-lifecycle";

export interface ProjectFileObjectStorage {
  remove(bucket: string, objectKey: string): Promise<void>;
  revokeBucket?(bucket: string, objectKeys: string[]): Promise<void>;
}

export async function deletePersistedProjectFiles(
  projectId: string,
  repository: PrismaProjectFileRepository,
  storage?: ProjectFileObjectStorage,
  fence?: ProjectDeletionFence
): Promise<void> {
  await fence?.assertCurrent();
  const files = await repository.listAll(projectId);
  await fence?.assertCurrent();
  if (files.length === 0) {
    // Upload initialization persists its row before issuing a signed URL. No rows therefore means
    // no issued upload can still race deletion, including installs where uploads were never enabled.
    if (storage?.revokeBucket)
      await storage.revokeBucket(projectFileBucketName(projectId), []);
    await fence?.assertCurrent();
    return;
  }
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
      const projectBucket = bucket === projectFileBucketName(projectId);
      if (projectBucket && !storage.revokeBucket)
        throw new Error("Project upload bucket revocation is unavailable; cleanup cannot be verified");
      const operations = projectBucket
        ? [() => storage.revokeBucket!(bucket, bucketFiles.map((file) => file.objectKey))]
        : bucketFiles.map((file) => () => storage.remove(bucket, file.objectKey));
      for (const operation of operations) {
        await fence?.assertCurrent();
        try {
          await operation();
        } catch (error) {
          failures.push(error instanceof Error ? error : new Error(String(error)));
        }
        await fence?.assertCurrent();
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

  await fence?.assertCurrent();
  await repository.deleteProject(projectId);
  await fence?.assertCurrent();
}

export async function deletePersistedProjectResources(
  projectId: string,
  input: {
    workspace: WorkspaceOrchestrator;
    files?: PrismaProjectFileRepository;
    storage?: ProjectFileObjectStorage;
  },
  additionalCleanup?: () => Promise<void>,
  fence?: ProjectDeletionFence
): Promise<void> {
  const guarded = (cleanup: () => Promise<void>) => async () => {
    await fence?.assertCurrent();
    await cleanup();
    await fence?.assertCurrent();
  };
  await deleteProjectResources([
    ...(additionalCleanup ? [guarded(additionalCleanup)] : []),
    guarded(() => input.workspace.deleteWorkspace(projectId, fence)),
    ...(input.files
      ? [guarded(() => deletePersistedProjectFiles(projectId, input.files!, input.storage, fence))]
      : [])
  ]);
}
