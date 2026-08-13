import test from "node:test";
import assert from "node:assert/strict";
import { registerPublishHttpRoutes } from "../../apps/platform-api/src/publish/http-routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const PROJECT_ID = "prj-published-app";
const APP_SLUG = "published-app";

test("single no-environment publish deploys runtime then returns the persistent registry envelope", async () => {
  const handlers = new Map();
  const persisted = [];
  const deployment = {
    id: "wdep-1",
    projectId: PROJECT_ID,
    slug: APP_SLUG,
    environment: "production",
    revision: 1,
    commitSha: "sha1",
    imageTag: "app:sha1",
    imageDigest: "image1",
    containerId: "c1",
    containerName: "app-sha1",
    publishedByUserId: "u1",
    healthStatus: "healthy",
    createdAt: new Date().toISOString()
  };
  await registerPublishHttpRoutes({
    rawApp: {
      all(path, handler) {
        handlers.set(path, handler);
      }
    },
    orchestrator: {},
    migrations: createMemoryMigrationStore(),
    nodeHttp: {},
    env: {},
    resolvePublishAuth: async () => ({
      userId: "u1",
      roles: ["creator"],
      projectIds: [PROJECT_ID]
    }),
    canAccessDeployment: async () => true,
    persistPublishedDeployment: async (input) => {
      persisted.push(input);
      return { status: 201, body: { data: { registryEntry: { route: `/apps/${APP_SLUG}` } } } };
    },
    recordAudit() {},
    publishStack: {
      publishService: {
        async publish() {
          return { ok: true, deployment };
        },
        async promote() {
          throw new Error("not used");
        }
      },
      deployments: createMemoryDeploymentStore(),
      async rehydrateDeployment() {
        return null;
      }
    }
  });
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return {
        json: (body) => {
          this.body = body;
        }
      };
    }
  };
  await handlers.get("/projects/:projectId/publish")(
    {
      params: { projectId: PROJECT_ID },
      method: "POST",
      headers: { authorization: "Bearer x" },
      body: undefined,
      url: "",
      originalUrl: "",
      on() {}
    },
    response
  );

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].deployment.id, "wdep-1");
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.registryEntry.route, `/apps/${APP_SLUG}`);
});

const persistenceFailureCases = [
  {
    name: "returns an error",
    persist: async () => ({ status: 503, body: { error: "registry_unavailable" } })
  },
  {
    name: "throws",
    persist: async () => {
      throw new Error("registry write failed");
    }
  }
];
const persistedDeploymentOperations = [
  { name: "publish", path: "/projects/:projectId/publish", body: { environment: "production" } },
  {
    name: "rollback",
    path: "/projects/:projectId/rollback",
    body: { environment: "production", commitSha: "sha1" }
  },
  { name: "promote", path: "/projects/:projectId/promote", body: undefined }
];

for (const operation of persistedDeploymentOperations) {
  for (const persistenceFailure of persistenceFailureCases) {
    test(`${operation.name} compensates the healthy runtime when registry persistence ${persistenceFailure.name}`, async () => {
      const handlers = new Map();
      const deactivated = [];
      const deployment = {
        id: "wdep-new",
        projectId: PROJECT_ID,
        slug: APP_SLUG,
        environment: "production",
        revision: 2,
        commitSha: "sha2",
        imageTag: "app:sha2-12345678",
        imageDigest: "image2",
        containerId: "c2",
        containerName: "app-sha2",
        publishedByUserId: "u1",
        healthStatus: "healthy",
        createdAt: new Date().toISOString()
      };
      await registerPublishHttpRoutes({
        rawApp: {
          all(path, handler) {
            handlers.set(path, handler);
          }
        },
        orchestrator: {},
        migrations: createMemoryMigrationStore(),
        nodeHttp: {},
        env: {},
        resolvePublishAuth: async () => ({
          userId: "u1",
          roles: ["creator"],
          projectIds: [PROJECT_ID]
        }),
        canAccessDeployment: async () => true,
        persistPublishedDeployment: persistenceFailure.persist,
        recordAudit() {},
        publishStack: {
          publishService: {
            async publish() {
              return { ok: true, deployment };
            },
            async promote() {
              return { ok: true, deployment };
            },
            async deactivate(input) {
              deactivated.push(input);
            }
          },
          deployments: createMemoryDeploymentStore(),
          async rehydrateDeployment() {
            return null;
          }
        }
      });
      const response = {
        statusCode: 0,
        body: null,
        status(code) {
          this.statusCode = code;
          return {
            json: (body) => {
              this.body = body;
            }
          };
        }
      };

      await handlers.get(operation.path)(
        {
          params: { projectId: PROJECT_ID },
          method: "POST",
          headers: {},
          body: operation.body,
          url: "",
          originalUrl: "",
          on() {}
        },
        response
      );

      assert.deepEqual(deactivated, [deployment]);
      assert.equal(response.statusCode >= 500, true);
    });
  }
}
