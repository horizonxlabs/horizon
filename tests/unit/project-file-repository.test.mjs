import test from "node:test";
import assert from "node:assert/strict";

const { PrismaProjectFileRepository } = await import("../../apps/platform-api/src/persistence/project-file-repository.ts");

test("persistent project files survive list and only clean indexed files resolve as attachments", async () => {
  const rows = new Map();
  const client = {
    projectFileUpload: {
      async create({ data }) { rows.set(data.id, data); return data; },
      async findMany({ where }) { return [...rows.values()].filter((row) => row.projectId === where.projectId && row.archivedAt === where.archivedAt); },
      async findUnique({ where }) { return rows.get(where.id) ?? null; },
      async update({ where, data }) { const row = rows.get(where.id); Object.assign(row, data); return row; }
    }
  };
  const repository = new PrismaProjectFileRepository(client);
  await repository.create({
    id: "upl_001", projectId: "prj_001", sourceId: "knsrc_001", versionId: "knsrc_001_v1", ownerUserId: "usr_001",
    fileName: "requirements.md", mimeType: "text/markdown", sizeBytes: 12, sha256: "a".repeat(64), bucket: "project-file-uploads", objectKey: "projects/prj_001/requirements.md", purpose: "ai_context", includeByDefault: true
  });
  assert.equal((await repository.list("prj_001")).length, 1);
  await repository.complete("upl_001", { scanStatus: "clean", excerpts: ["Approved workflow"] });
  const attachments = await repository.resolveAttachments("prj_001", ["upl_001"]);
  assert.deepEqual(attachments.sourceIds, ["knsrc_001"]);
  assert.deepEqual(attachments.excerpts, ["Approved workflow"]);
});
