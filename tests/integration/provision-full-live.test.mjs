import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLiveFixture } from "./workspace-live-fixture.mjs";

test(
  "cold provisioning creates real resources and deletion removes them",
  {
    skip: process.env.EVCP_PROVISION_LIVE !== "1",
    timeout: 300_000
  },
  async (context) => {
    const fixture = await createWorkspaceLiveFixture(context, { targetSize: 0 });
    const { orchestrator, projectId, projectKey, docker } = fixture;
    const record = await orchestrator.provisionWorkspace({ projectId, slug: projectKey });
    assert.equal(record.state, "running");
    assert.equal(record.resourceKey, projectKey);
    assert.ok(record.containerId);
    assert.equal((await docker.inspectContainer(`evcp-ws-${projectKey}`)).running, true);
    assert.deepEqual(fixture.calls, { schemas: 1, buckets: 1, keys: 1 });
    assert.deepEqual((await orchestrator.listSecretNames(projectId)).sort(), [
      "DATABASE_URL",
      "LLM_GATEWAY_KEY",
      "S3_ACCESS_KEY",
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_SECRET_KEY"
    ]);
    const preview = await docker.execInContainer(record.containerId, [
      "curl",
      "-fsS",
      `http://127.0.0.1:3000/preview/${projectKey}/api/health`
    ]);
    assert.equal(preview.exitCode, 0);
    await orchestrator.deleteWorkspace(projectId);
    await fixture.assertResourcesRemoved();
  }
);
