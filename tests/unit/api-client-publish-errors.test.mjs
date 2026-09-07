import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformApiClient, PlatformApiError } from "../../packages/api-client/src/index.ts";
import { createPublishRoutes } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

for (const scenario of [
  {
    name: "pre-publish checks",
    outcome: {
      ok: false,
      reason: "pre_checks_failed",
      failures: ["git working tree is not clean"]
    },
    code: "pre_checks_failed",
    message: "git working tree is not clean",
    status: 422
  },
  {
    name: "image build error",
    error: new Error("Production image build failed"),
    code: "publish_failed",
    message: "Production image build failed",
    status: 500
  },
  {
    name: "health check failure",
    outcome: { ok: false, reason: "health_failed", deployment: { healthStatus: "failed" } },
    code: "health_failed",
    message: "health failed",
    status: 502
  }
]) {
  test(`App Store publish preserves runtime ${scenario.name} details`, async () => {
    const routes = createPublishRoutes({
      publishService: {
        publish: async () => {
          if (scenario.error) throw scenario.error;
          return scenario.outcome;
        }
      },
      deployments: createMemoryDeploymentStore()
    });
    const client = createPlatformApiClient({
      baseUrl: "https://platform.example/api",
      fetcher: async (_url, init) => {
        assert.deepEqual(JSON.parse(init.body), { subdomain: "myaccount", visibility: "public" });
        const response = await routes.publish(
          { userId: "u1", projectIds: ["p1"], roles: ["creator"] },
          { projectId: "p1", slug: "p1", environment: "production" }
        );
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          statusText: "HTTP failure"
        });
      }
    });
    await assert.rejects(
      client.publishProject("p1", { subdomain: "myaccount", visibility: "public" }),
      (error) => {
        assert.ok(error instanceof PlatformApiError);
        assert.equal(error.message, scenario.message);
        assert.equal(error.code, scenario.code);
        assert.equal(error.status, scenario.status);
        return true;
      }
    );
  });
}
