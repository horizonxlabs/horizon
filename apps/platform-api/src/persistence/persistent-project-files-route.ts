import { createHash, randomUUID } from "node:crypto";

import type {
  ProjectFilePurpose,
  ProjectFileUpload,
  ProjectFileUploadInitResult,
  ProjectFileScanStatus
} from "../platform-services";
import type { ProjectFileUploadUrlIssuer } from "../workspace-orchestrator/minio-object-storage";
import type { PersistedProjectFile, PrismaProjectFileRepository } from "./project-file-repository";
import type { ProjectLifecycleCoordinator } from "../project-lifecycle";

const bucket = "project-file-uploads";
const maxBytes = 25 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/yaml",
  "text/yaml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

export function isPersistenceProjectFileRoute(path: string): boolean {
  return /^\/creator\/projects\/[^/]+\/files(?:\/init|\/[^/]+\/complete)?$/.test(path);
}

export async function initializePersistentProjectFile(input: {
  repository: PrismaProjectFileRepository;
  issuer: ProjectFileUploadUrlIssuer;
  actorId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  purpose?: ProjectFilePurpose;
  includeByDefault?: boolean;
  lifecycle?: ProjectLifecycleCoordinator;
}): Promise<ProjectFileUploadInitResult> {
  if (input.lifecycle) {
    const { lifecycle, ...operationInput } = input;
    return lifecycle.runChildMutation(input.projectId, () =>
      initializePersistentProjectFile(operationInput)
    );
  }
  validate(input);
  const id = `upl_${randomUUID()}`;
  const sourceId = `knsrc_${id}`;
  const versionId = `${sourceId}_v1`;
  const objectKey = `projects/${input.projectId}/knowledge/${sourceId}/${versionId}/${sanitize(input.fileName)}`;
  const file = await input.repository.create({
    id,
    projectId: input.projectId,
    sourceId,
    versionId,
    ownerUserId: input.actorId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    bucket,
    objectKey,
    purpose: input.purpose ?? "ai_context",
    includeByDefault: input.includeByDefault ?? true
  });
  const upload = await input.issuer.issue(bucket, objectKey);
  return {
    uploadId: id,
    sourceId,
    versionId,
    objectKey,
    uploadUrl: upload.url,
    expiresAt: upload.expiresAt.toISOString(),
    file: map(file)
  };
}

export async function completePersistentProjectFile(input: {
  repository: PrismaProjectFileRepository;
  uploadId: string;
  scanStatus?: ProjectFileScanStatus;
  extractedText?: string;
  excerpts?: string[];
  projectId?: string;
  lifecycle?: ProjectLifecycleCoordinator;
}): Promise<{ file: ProjectFileUpload }> {
  if (input.lifecycle && input.projectId) {
    const { lifecycle, projectId, ...operationInput } = input;
    return lifecycle.runChildMutation(projectId, () =>
      completePersistentProjectFile(operationInput)
    );
  }
  const scanStatus = input.scanStatus ?? "clean";
  const excerpts = scanStatus === "clean" ? excerpt(input.extractedText, input.excerpts) : [];
  const file = await input.repository.complete(input.uploadId, { scanStatus, excerpts });
  return { file: map(file) };
}

export async function handlePersistentProjectFilesRoute(input: {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  repository?: PrismaProjectFileRepository;
  issuer?: ProjectFileUploadUrlIssuer;
  resolveActor: () => Promise<{ id: string }>;
  resolveProject: (actor: { id: string }, projectId: string) => Promise<{ id: string }>;
  lifecycle?: ProjectLifecycleCoordinator;
}): Promise<{ status: 200 | 201; data: unknown } | undefined> {
  const list = input.path.match(/^\/creator\/projects\/([^/]+)\/files$/);
  const init = input.path.match(/^\/creator\/projects\/([^/]+)\/files\/init$/);
  const complete = input.path.match(/^\/creator\/projects\/([^/]+)\/files\/([^/]+)\/complete$/);
  if (!list && !init && !complete) return undefined;
  if (!input.repository || !input.issuer)
    throw new Error("Persistent project file storage is not configured");
  const projectId = (list ?? init ?? complete)![1];
  const actor = await input.resolveActor();
  const project = await input.resolveProject(actor, projectId);
  if (input.method === "GET" && list)
    return { status: 200, data: (await input.repository.list(project.id)).map(map) };
  if (input.method === "POST" && init)
    return {
      status: 201,
      data: await initializePersistentProjectFile({
        repository: input.repository,
        issuer: input.issuer,
        actorId: actor.id,
        projectId: project.id,
        fileName: String(input.body?.fileName ?? ""),
        mimeType: String(input.body?.mimeType ?? ""),
        sizeBytes: Number(input.body?.sizeBytes ?? 0),
        sha256: String(input.body?.sha256 ?? ""),
        purpose: input.body?.purpose
          ? (String(input.body.purpose) as ProjectFilePurpose)
          : undefined,
        includeByDefault:
          input.body?.includeByDefault === undefined
            ? undefined
            : Boolean(input.body.includeByDefault),
        lifecycle: input.lifecycle
      })
    };
  if (input.method === "POST" && complete) {
    if ((await input.repository.get(complete[2])).projectId !== project.id)
      throw new Error("Project file does not belong to this project");
    return {
      status: 200,
      data: await completePersistentProjectFile({
        repository: input.repository,
        uploadId: complete[2],
        scanStatus: input.body?.scanStatus
          ? (String(input.body.scanStatus) as ProjectFileScanStatus)
          : undefined,
        extractedText: input.body?.extractedText ? String(input.body.extractedText) : undefined,
        excerpts: Array.isArray(input.body?.excerpts) ? input.body.excerpts.map(String) : undefined,
        projectId: project.id,
        lifecycle: input.lifecycle
      })
    };
  }
  return undefined;
}

export function mapPersistentProjectFile(file: PersistedProjectFile): ProjectFileUpload {
  return map(file);
}

function map(file: PersistedProjectFile): ProjectFileUpload {
  return {
    ...file,
    archivedAt: file.archivedAt?.toISOString(),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString()
  };
}
function validate(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}) {
  if (
    !input.fileName.trim() ||
    !allowedMimeTypes.has(input.mimeType) ||
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > maxBytes ||
    !/^[a-f0-9]{64}$/i.test(input.sha256)
  )
    throw new Error("Invalid project file upload metadata");
}
function sanitize(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "") || createHash("sha256").update(name).digest("hex").slice(0, 12)
  );
}
function excerpt(text?: string, excerpts?: string[]) {
  if (excerpts?.length) return excerpts.map((value) => value.trim()).filter(Boolean);
  if (!text?.trim()) return [];
  return (text.match(/[\s\S]{1,800}/g) ?? [])
    .slice(0, 8)
    .map((value) => value.trim())
    .filter(Boolean);
}
