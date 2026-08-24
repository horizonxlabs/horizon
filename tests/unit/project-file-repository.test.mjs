import test from "node:test";
import assert from "node:assert/strict";

const { PrismaProjectFileRepository } = await import("../../apps/platform-api/src/persistence/project-file-repository.ts");
const { deletePersistedProjectFiles } = await import("../../apps/platform-api/src/persistence/project-file-cleanup.ts");

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

test("project file cleanup removes every object before metadata and can be retried", async () => {
  const rows = new Map([
    ["upl_001", { id: "upl_001", projectId: "prj_001", bucket: "project-file-uploads", objectKey: "projects/prj_001/one.md", archivedAt: null, createdAt: new Date("2026-01-01") }],
    ["upl_002", { id: "upl_002", projectId: "prj_001", bucket: "project-file-uploads", objectKey: "projects/prj_001/two.md", archivedAt: new Date("2026-02-01"), createdAt: new Date("2026-02-01") }]
  ]);
  const client = {
    projectFileUpload: {
      async create({ data }) { rows.set(data.id, data); return data; },
      async findMany({ where }) { return [...rows.values()].filter((row) => row.projectId === where.projectId && (where.archivedAt === undefined || row.archivedAt === where.archivedAt)); },
      async findUnique({ where }) { return rows.get(where.id) ?? null; },
      async update({ where, data }) { const row = rows.get(where.id); Object.assign(row, data); return row; },
      async deleteMany({ where }) {
        for (const [id, row] of rows) if (row.projectId === where.projectId) rows.delete(id);
        return { count: 2 };
      }
    }
  };
  const objects = new Set(["projects/prj_001/one.md", "projects/prj_001/two.md"]);
  const attempted = [];
  let failOnce = true;
  const storage = {
    async remove(_bucket, objectKey) {
      attempted.push(objectKey);
      if (objectKey.endsWith("one.md") && failOnce) {
        failOnce = false;
        throw new Error("object store unavailable");
      }
      objects.delete(objectKey);
    }
  };
  const repository = new PrismaProjectFileRepository(client);

  await assert.rejects(
    deletePersistedProjectFiles("prj_001", repository, storage),
    (error) => error instanceof AggregateError && error.errors.length === 1
  );
  assert.deepEqual(attempted, ["projects/prj_001/one.md", "projects/prj_001/two.md"]);
  assert.equal(rows.size, 2, "metadata remains until every object cleanup succeeds");

  await deletePersistedProjectFiles("prj_001", repository, storage);
  assert.equal(objects.size, 0);
  assert.equal(rows.size, 0, "all project-file metadata is deleted after object cleanup");
});
