import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaDeploymentStore } from "../../apps/platform-api/src/publish/prisma-deployment-store.ts";

function fakeClient({ createError } = {}) {
  const rows = [];
  const calls = [];
  let pendingCreateError = createError;
  return {
    rows,
    calls,
    recover() {
      pendingCreateError = undefined;
    },
    workspaceDeploymentRevision: {
      async findMany() {
        return rows.map((row) => ({ ...row }));
      },
      async create({ data }) {
        calls.push({ operation: "create", id: data.id });
        if (pendingCreateError) throw pendingCreateError;
        rows.push({ ...data });
        return data;
      },
      async update({ where, data }) {
        calls.push({ operation: "update", id: where.id });
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error(`missing revision '${where.id}'`);
        Object.assign(row, data);
        return row;
      }
    }
  };
}

test("Prisma deployment store survives reconstruction with immutable revision linkage", async () => {
  const client = fakeClient();
  const firstStore = await createPrismaDeploymentStore(undefined, client);
  const created = firstStore.create({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha1",
    imageTag: "app:sha1",
    imageDigest: "sha256:image1",
    containerId: "c1",
    containerName: "app-sha1",
    publishedByUserId: "u1"
  });
  firstStore.updateHealth(created.id, "healthy");
  await firstStore.flush();

  const restartedStore = await createPrismaDeploymentStore(undefined, client);
  const current = restartedStore.getCurrent("app", "production");
  assert.equal(current.commitSha, "sha1");
  assert.equal(current.imageDigest, "sha256:image1");
  assert.equal(current.containerName, "app-sha1");
  assert.equal(current.revision, 1);
});

test("Prisma deployment writes handle rejection immediately and flush throws the first failure", async () => {
  const databaseError = new Error("database is in recovery mode");
  const client = fakeClient({ createError: databaseError });
  const store = await createPrismaDeploymentStore(undefined, client);
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);

  try {
    const created = store.create(deploymentInput("sha1"));
    store.updateHealth(created.id, "healthy");
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandled, []);
    await assert.rejects(store.flush(), (error) => error === databaseError);
    assert.deepEqual(
      client.calls.map((call) => call.operation),
      ["create"],
      "writes after the first failure must stay fail-closed until flush observes it"
    );
    assert.equal(client.rows.length, 0);
    assert.deepEqual(store.list("p1"), []);
    assert.equal(store.getCurrent("app", "production"), null);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("Prisma deployment queue accepts new ordered writes after flush observes a failure", async () => {
  const client = fakeClient({ createError: new Error("temporary recovery") });
  const store = await createPrismaDeploymentStore(undefined, client);
  store.create(deploymentInput("sha1"));
  await assert.rejects(store.flush(), /temporary recovery/);

  client.recover();
  const recovered = store.create(deploymentInput("sha2"));
  store.updateHealth(recovered.id, "healthy");
  await store.flush();

  assert.equal(client.rows.length, 1);
  assert.equal(client.rows[0].commitSha, "sha2");
  assert.equal(client.rows[0].healthStatus, "healthy");
  assert.deepEqual(
    client.calls.map((call) => call.operation),
    ["create", "create", "update"]
  );
});

function deploymentInput(commitSha) {
  return {
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha,
    imageTag: `app:${commitSha}`,
    imageDigest: `sha256:${commitSha}`,
    containerId: `container-${commitSha}`,
    containerName: `app-${commitSha}`,
    publishedByUserId: "u1"
  };
}
