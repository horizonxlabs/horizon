import test from "node:test";
import assert from "node:assert/strict";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

async function createRawPublishHarness({
  preflightPublishedSubdomain,
  persistPublishedDeployment
} = {}) {
  const handlers = new Map();
  const calls = [];
  const deactivatedDeployments = [];
  const deployments = createMemoryDeploymentStore();
  let publishCalls = 0;

  await registerPublishHttpRoutes({
    rawApp: { all: (path, handler) => handlers.set(path, handler) },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {},
    resolvePublishAuth: async () => {
      calls.push("auth");
      return {
        userId: "usr_creator",
        roles: ["creator"],
        projectIds: ["prj_publish"]
      };
    },
    canAccessDeployment: async () => true,
    preflightPublishedSubdomain: preflightPublishedSubdomain
      ? async (input) => {
          calls.push("preflight");
          return preflightPublishedSubdomain(input);
        }
      : undefined,
    persistPublishedDeployment: persistPublishedDeployment
      ? async (input) => {
          calls.push("persist");
          return persistPublishedDeployment(input);
        }
      : undefined,
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish(input) {
          publishCalls += 1;
          calls.push("publish");
          return {
            ok: true,
            deployment: {
              id: "wdep_new",
              projectId: input.projectId,
              slug: input.slug,
              environment: input.environment,
              revision: 1,
              commitSha: "abc123",
              imageTag: "app:abc123",
              imageDigest: "sha256:abc123",
              containerId: "container-new",
              containerName: "app-new",
              publishedByUserId: input.publishedByUserId,
              healthStatus: "healthy",
              createdAt: "2026-08-27T00:00:00.000Z"
            }
          };
        },
        async promote() {
          calls.push("promote");
          return {
            ok: true,
            deployment: {
              id: "wdep_promoted",
              projectId: "prj_publish",
              slug: "prj-publish",
              environment: "production",
              revision: 2,
              commitSha: "abc123",
              imageTag: "app:abc123",
              imageDigest: "sha256:abc123",
              containerId: "container-promoted",
              containerName: "app-promoted",
              publishedByUserId: "usr_creator",
              healthStatus: "healthy",
              createdAt: "2026-08-27T00:00:00.000Z"
            }
          };
        },
        async deactivate(deployment) {
          calls.push("deactivate");
          deactivatedDeployments.push(deployment);
        }
      },
      deployments,
      async rehydrateDeployment() {
        return null;
      }
    }
  });

  const response = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return {
        json: (body) => {
          this.body = body;
          this.headersSent = true;
        }
      };
    },
    setHeader() {},
    end() {},
    write() {}
  };
  const invoke = (path, body) => {
    response.statusCode = 200;
    response.body = undefined;
    response.headersSent = false;
    return handlers.get(path)(
      {
        params: { projectId: "prj_publish" },
        method: "POST",
        headers: { authorization: "Bearer creator" },
        url: "/projects/prj_publish/publish",
        originalUrl: "/projects/prj_publish/publish",
        body,
        on() {}
      },
      response
    );
  };
  return {
    calls,
    deactivatedDeployments,
    get publishCalls() {
      return publishCalls;
    },
    response,
    publish: (body) => invoke("/projects/:projectId/publish", body),
    rollback: (body) => invoke("/projects/:projectId/rollback", body),
    promote: (body = {}) => invoke("/projects/:projectId/promote", body)
  };
}

test("App Store publish rejects an invalid subdomain before preflight or build", async () => {
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async ({ subdomain }) => ({ subdomain })
  });
  await harness.publish({ subdomain: "Admin" });
  assert.equal(harness.response.statusCode, 400);
  assert.equal(harness.response.body.ok, false);
  assert.equal(harness.response.body.error.code, "SUBDOMAIN_INVALID");
  assert.deepEqual(harness.calls, ["auth"]);
  assert.equal(harness.publishCalls, 0);
});

test("App Store publish rejects a taken subdomain before build", async () => {
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async () => {
      throw Object.assign(new Error("This subdomain is already in use."), {
        code: "SUBDOMAIN_TAKEN",
        status: 409
      });
    }
  });
  await harness.publish({ subdomain: "people-ops" });
  assert.equal(harness.response.statusCode, 409);
  assert.equal(harness.response.body.ok, false);
  assert.equal(harness.response.body.error.code, "SUBDOMAIN_TAKEN");
  assert.deepEqual(harness.calls, ["auth", "preflight"]);
  assert.equal(harness.publishCalls, 0);
});

test("App Store publish preflights before build and persists the normalized subdomain last", async () => {
  let persistedInput;
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async () => ({ subdomain: "people-ops" }),
    persistPublishedDeployment: async (input) => {
      persistedInput = input;
      return { status: 201, body: { ok: true, data: { published: true } } };
    }
  });
  await harness.publish({ subdomain: "people-ops" });
  assert.equal(harness.response.statusCode, 201);
  assert.deepEqual(harness.calls, ["auth", "preflight", "publish", "persist"]);
  assert.equal(persistedInput.subdomain, "people-ops");
  assert.equal(persistedInput.deployment.healthStatus, "healthy");
});

test("App Store publish compensates a persistence race by deactivating only the failed deployment", async () => {
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async () => ({ subdomain: "people-new" }),
    persistPublishedDeployment: async () => ({
      status: 409,
      body: {
        ok: false,
        error: {
          code: "SUBDOMAIN_TAKEN",
          message: "This subdomain is already in use."
        }
      }
    })
  });
  await harness.publish({ subdomain: "people-new" });
  assert.equal(harness.response.statusCode, 409);
  assert.equal(harness.response.body.error.code, "SUBDOMAIN_TAKEN");
  assert.deepEqual(harness.calls, ["auth", "preflight", "publish", "persist", "deactivate"]);
  assert.deepEqual(
    harness.deactivatedDeployments.map((deployment) => deployment.id),
    ["wdep_new"]
  );
});

test("explicit deployment modes do not preflight or replace an App Store subdomain", async () => {
  const persisted = [];
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async () => {
      assert.fail("explicit deployment modes must not preflight an App Store subdomain");
    },
    persistPublishedDeployment: async (input) => {
      persisted.push(input);
      return { status: 201, body: { deployment: input.deployment } };
    }
  });
  await harness.publish({ environment: "staging", subdomain: "ignored-staging" });
  await harness.publish({ environment: "production", subdomain: "ignored-production" });
  await harness.rollback({
    environment: "production",
    commitSha: "previous-sha",
    subdomain: "ignored-rollback"
  });
  await harness.promote({ subdomain: "ignored-promote" });
  assert.equal(harness.response.statusCode, 201);
  assert.equal(harness.calls.includes("preflight"), false);
  assert.equal(persisted.length, 3);
  assert.deepEqual(
    persisted.map((input) => input.subdomain),
    [undefined, undefined, undefined]
  );
});
