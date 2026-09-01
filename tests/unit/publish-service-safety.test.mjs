import test from "node:test";
import assert from "node:assert/strict";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { createPrismaDeploymentStore } from "../../apps/platform-api/src/publish/prisma-deployment-store.ts";
import { buildPublishServiceDeps } from "./publish-service-test-helpers.mjs";

test("publish fails before starting a deployment when workspace secrets cannot be resolved", async () => {
  const deps = buildPublishServiceDeps();
  deps.resolveEnv = async () => {
    throw new Error("workspace secrets unavailable");
  };
  const service = createPublishService(deps);

  await assert.rejects(
    () =>
      service.publish({
        projectId: "p1",
        slug: "app",
        environment: "production",
        publishedByUserId: "u1"
      }),
    /workspace secrets unavailable/
  );
  assert.equal(
    deps.docker.state.containers.some((item) => item.spec.name === "evcp-production-app"),
    false
  );
});

test("rollback is rejected before checkout when the target predates an applied migration", async () => {
  const deps = buildPublishServiceDeps();
  deps.git.state.projects.p1.head = "sha2";
  deps.git.state.projects.p1.migrationNames = { sha1: [], sha2: ["20260714_add_approvals"] };
  await deps.migrations.recordMigration({
    projectId: "p1",
    name: "20260714_add_approvals",
    sql: "create table approvals(id text primary key)",
    commitSha: "sha2"
  });

  const outcome = await createPublishService(deps).publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha1",
    publishedByUserId: "u1"
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "pre_checks_failed");
  assert.match(outcome.failures.join("\n"), /predates applied migrations/);
  assert.match(outcome.failures.join("\n"), /Restore a compatible database backup/);
  assert.equal(deps.git.state.projects.p1.head, "sha2");
  assert.deepEqual(deps.git.state.projects.p1.checkouts ?? [], []);
  assert.equal(deps.docker.state.builds.length, 0);
});

test("publish compensates a rejected Prisma lifecycle batch and the next publish succeeds", async () => {
  const rows = [];
  let rejectNextUpdate = true;
  const revisionTable = {
    async findMany() {
      return rows.map((row) => ({ ...row }));
    },
    async create({ data }) {
      rows.push({ ...data });
      return data;
    },
    async update({ where, data }) {
      if (rejectNextUpdate) {
        rejectNextUpdate = false;
        throw new Error("updateHealth rejected");
      }
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error(`missing revision '${where.id}'`);
      Object.assign(row, data);
      return row;
    },
    async deleteMany({ where }) {
      const retained = rows.filter((row) => where.id ? row.id !== where.id : row.projectId !== where.projectId);
      const count = rows.length - retained.length;
      rows.splice(0, rows.length, ...retained);
      return { count };
    }
  };
  const client = {
    workspaceDeploymentRevision: revisionTable,
    async $transaction(operation) {
      const snapshot = rows.map((row) => ({ ...row }));
      try {
        return await operation({ workspaceDeploymentRevision: revisionTable });
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      }
    }
  };
  const deps = buildPublishServiceDeps();
  deps.deployments = await createPrismaDeploymentStore(undefined, client);
  const service = createPublishService(deps);

  await assert.rejects(
    service.publish({
      projectId: "p1",
      slug: "app",
      environment: "production",
      publishedByUserId: "u1"
    }),
    /updateHealth rejected/
  );

  assert.deepEqual(rows, [], "the failed lifecycle must leave no durable pending revision");
  assert.deepEqual(deps.deployments.list("p1"), [], "optimistic state must match durability");
  assert.equal(
    deps.docker.state.containers.filter((item) =>
      item.spec.name?.startsWith("evcp-production-app-")
    ).length,
    0,
    "the failed publish must remove its candidate container"
  );

  const recovered = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.deployment.revision, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].healthStatus, "healthy");
});

test("a thrown health check discards the queued candidate before the next publish", async () => {
  const rows = [];
  const revisionTable = {
    async findMany() {
      return rows.map((row) => ({ ...row }));
    },
    async create({ data }) {
      rows.push({ ...data });
      return data;
    },
    async update({ where, data }) {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error(`missing revision '${where.id}'`);
      Object.assign(row, data);
      return row;
    },
    async deleteMany({ where }) {
      const retained = rows.filter((row) => where.id ? row.id !== where.id : row.projectId !== where.projectId);
      const count = rows.length - retained.length;
      rows.splice(0, rows.length, ...retained);
      return { count };
    }
  };
  const client = {
    workspaceDeploymentRevision: revisionTable,
    async $transaction(operation) {
      const snapshot = rows.map((row) => ({ ...row }));
      try {
        return await operation({ workspaceDeploymentRevision: revisionTable });
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      }
    }
  };
  const deps = buildPublishServiceDeps();
  deps.deployments = await createPrismaDeploymentStore(undefined, client);
  const healthError = new Error("health probe connection reset");
  deps.health.check = async () => {
    throw healthError;
  };
  const service = createPublishService(deps);

  await assert.rejects(
    service.publish({
      projectId: "p1",
      slug: "app",
      environment: "production",
      publishedByUserId: "u1"
    }),
    (error) => error === healthError
  );
  assert.deepEqual(rows, []);
  assert.equal(
    deps.docker.state.containers.filter((item) =>
      item.spec.name?.startsWith("evcp-production-app-")
    ).length,
    0
  );

  deps.health.check = async () => true;
  const recovered = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.deployment.revision, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].healthStatus, "healthy");
});

test("cleanup candidate survives store restart when pre-container image cleanup fails", async () => {
  const rows = [];
  const revisionTable = {
    async findMany() { return rows.map((row) => ({ ...row })); },
    async create({ data }) { rows.push({ ...data }); return data; },
    async update({ where, data }) {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error(`missing revision '${where.id}'`);
      Object.assign(row, data);
      return row;
    },
    async deleteMany({ where }) {
      const retained = rows.filter((row) =>
        where.id ? row.id !== where.id : row.projectId !== where.projectId);
      const count = rows.length - retained.length;
      rows.splice(0, rows.length, ...retained);
      return { count };
    }
  };
  const client = {
    workspaceDeploymentRevision: revisionTable,
    async $transaction(operation) {
      const snapshot = rows.map((row) => ({ ...row }));
      try { return await operation({ workspaceDeploymentRevision: revisionTable }); }
      catch (error) { rows.splice(0, rows.length, ...snapshot); throw error; }
    }
  };
  const deps = buildPublishServiceDeps();
  deps.deployments = await createPrismaDeploymentStore(undefined, client);
  deps.resolveEnv = async () => { throw new Error("secrets unavailable"); };
  let failCleanup = true;
  const originalRemoveImage = deps.docker.removeImage.bind(deps.docker);
  deps.docker.removeImage = async (tag) => {
    if (failCleanup) { failCleanup = false; throw new Error("docker unavailable"); }
    return originalRemoveImage(tag);
  };

  await assert.rejects(
    createPublishService(deps).publish({
      projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
    }),
    /Deployment compensation failed/
  );
  assert.equal(rows.length, 1, "cleanup identity is durable before container creation");
  assert.equal(rows[0].containerId, null);

  deps.deployments = await createPrismaDeploymentStore(undefined, client);
  await createPublishService(deps).deleteProject("p1");
  assert.deepEqual(rows, []);
  assert.equal(deps.docker.state.removedImages.length, 1);
});
