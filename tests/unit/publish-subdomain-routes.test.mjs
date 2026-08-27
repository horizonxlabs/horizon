import test from "node:test";
import assert from "node:assert/strict";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { PermissionError } from "../../apps/platform-api/src/platform-services.ts";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");

async function createRawPublishHarness({
  preflightPublishedSubdomain,
  persistPublishedDeployment,
  projectId = "prj_publish",
  requestHeaders = { authorization: "Bearer creator" }
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
        projectIds: [projectId]
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
              projectId,
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
        params: { projectId },
        method: "POST",
        headers: requestHeaders,
        url: `/projects/${projectId}/publish`,
        originalUrl: `/projects/${projectId}/publish`,
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

function createReadyLegacyPublishFixture() {
  const services = createPlatformApiServices();
  const headers = { "x-mock-user-email": "creator@company.com" };
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser(headers);
  const provider = services.aiGovernance.createProvider(admin, {
    name: "Legacy publish test provider",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Legacy publish test key",
    secret: "test-only-key",
    usageMode: "production",
    quotaTokens: 10_000,
    fallbackPriority: 1
  });
  for (const scenario of ["prd_generation", "frontend_coding"]) {
    services.aiGovernance.configureRoute(admin, {
      scenario,
      primaryProviderId: provider.id,
      primaryModel: "gpt-4.1"
    });
  }
  services.aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1_000,
    monthlyLimit: 5_000,
    warningThreshold: 800,
    hardStop: true,
    usedToday: 0
  });
  const project = services.projects.createProject({
    actor: creator,
    name: "Legacy Operations",
    appType: "Workflow App",
    businessProblem: "Keep legacy deployment modes compatible",
    targetDepartment: "Operations",
    intendedUsers: ["Employee"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Build the operations app" });
  services.publish.publishApp(creator, project.id, { subdomain: "legacy-operations" });
  return { services, creator, project, headers };
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

test("App Store publish rejects an inaccessible project before build", async () => {
  const harness = await createRawPublishHarness({
    preflightPublishedSubdomain: async () => {
      throw new PermissionError("Role creator cannot access project prj_publish");
    }
  });
  await harness.publish({ subdomain: "people-ops" });
  assert.equal(harness.response.statusCode, 403);
  assert.equal(harness.response.body.ok, false);
  assert.equal(harness.response.body.error.code, "FORBIDDEN");
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

test("legacy persistence keeps explicit production rollback and promote compatible", async () => {
  const { services, creator, project, headers } = createReadyLegacyPublishFixture();
  const harness = await createRawPublishHarness({
    projectId: project.id,
    requestHeaders: headers,
    preflightPublishedSubdomain: async () => {
      assert.fail("explicit deployment modes must not preflight an App Store subdomain");
    },
    persistPublishedDeployment: ({ projectId, deployment, subdomain }) =>
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${projectId}/publish`,
        headers,
        body: { runtimeDeployment: deployment, subdomain }
      })
  });

  const statuses = [];
  await harness.publish({ environment: "production" });
  statuses.push(harness.response.statusCode);
  await harness.rollback({ environment: "production", commitSha: "previous-sha" });
  statuses.push(harness.response.statusCode);
  await harness.promote();
  statuses.push(harness.response.statusCode);

  assert.deepEqual(statuses, [201, 201, 201]);
  assert.deepEqual(harness.deactivatedDeployments, []);
  assert.equal(services.publish.listRegistry(creator)[0].subdomain, "legacy-operations");
});
