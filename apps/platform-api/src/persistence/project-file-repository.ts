export type PersistedProjectFile = {
  id: string;
  projectId: string;
  sourceId: string;
  versionId: string;
  ownerUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bucket: string;
  objectKey: string;
  purpose: "ai_context" | "app_asset";
  uploadStatus: "pending" | "uploaded" | "failed";
  scanStatus: "pending" | "clean" | "failed" | "malicious" | "quarantined";
  indexStatus: "pending" | "indexed" | "failed";
  extractionStatus: "pending" | "indexed" | "failed";
  includeByDefault: boolean;
  excerpts: string[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ProjectFilePersistenceClient {
  projectFileUpload: {
    create(args: { data: PersistedProjectFile }): Promise<PersistedProjectFile>;
    findMany(args: { where: { projectId: string; archivedAt?: null }; orderBy?: { createdAt: "asc" } }): Promise<PersistedProjectFile[]>;
    findUnique(args: { where: { id: string } }): Promise<PersistedProjectFile | null>;
    update(args: { where: { id: string }; data: Partial<PersistedProjectFile> }): Promise<PersistedProjectFile>;
    deleteMany(args: { where: { projectId?: string; id?: string } }): Promise<{ count: number }>;
  };
}

export class PrismaProjectFileRepository {
  constructor(private readonly client: ProjectFilePersistenceClient) {}

  async create(input: Pick<PersistedProjectFile, "id" | "projectId" | "sourceId" | "versionId" | "ownerUserId" | "fileName" | "mimeType" | "sizeBytes" | "sha256" | "bucket" | "objectKey" | "purpose" | "includeByDefault">): Promise<PersistedProjectFile> {
    const now = new Date();
    return this.client.projectFileUpload.create({ data: { ...input, uploadStatus: "pending", scanStatus: "pending", indexStatus: "pending", extractionStatus: "pending", excerpts: [], archivedAt: null, createdAt: now, updatedAt: now } });
  }

  async list(projectId: string): Promise<PersistedProjectFile[]> {
    return this.client.projectFileUpload.findMany({ where: { projectId, archivedAt: null }, orderBy: { createdAt: "asc" } });
  }

  async listAll(projectId: string): Promise<PersistedProjectFile[]> {
    return this.client.projectFileUpload.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  }

  async deleteProject(projectId: string): Promise<number> {
    const result = await this.client.projectFileUpload.deleteMany({ where: { projectId } });
    return result.count;
  }

  async deleteUpload(id: string): Promise<number> {
    const result = await this.client.projectFileUpload.deleteMany({ where: { id } });
    return result.count;
  }

  async get(id: string): Promise<PersistedProjectFile> {
    return this.require(id);
  }

  async complete(id: string, input: { scanStatus: PersistedProjectFile["scanStatus"]; excerpts: string[] }): Promise<PersistedProjectFile> {
    await this.require(id);
    const clean = input.scanStatus === "clean";
    return this.client.projectFileUpload.update({ where: { id }, data: { uploadStatus: clean ? "uploaded" : "failed", scanStatus: input.scanStatus, indexStatus: clean ? "indexed" : "failed", extractionStatus: clean ? "indexed" : "failed", excerpts: clean ? input.excerpts : [], updatedAt: new Date() } });
  }

  async resolveAttachments(projectId: string, ids: string[]): Promise<{ sourceIds: string[]; versionIds: string[]; excerpts: string[] }> {
    const files = await Promise.all(ids.map((id) => this.require(id)));
    for (const file of files) {
      if (file.projectId !== projectId) throw new Error("Project file does not belong to this project");
      if (file.uploadStatus !== "uploaded" || file.scanStatus !== "clean" || file.indexStatus !== "indexed" || file.extractionStatus !== "indexed") throw new Error("Project file is not ready for AI context");
    }
    return { sourceIds: files.map((file) => file.sourceId), versionIds: files.map((file) => file.versionId), excerpts: files.flatMap((file) => file.excerpts) };
  }

  private async require(id: string): Promise<PersistedProjectFile> {
    const file = await this.client.projectFileUpload.findUnique({ where: { id } });
    if (!file) throw new Error(`Unknown project file upload: ${id}`);
    return file;
  }
}
