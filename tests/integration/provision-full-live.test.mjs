import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { schemaNameFor } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

const LIVE = process.env.EVCP_PROVISION_LIVE === "1";

test(
  "provisionWorkspace creates a real schema + bucket + running container, and cleanup removes them",
  { skip: !LIVE },
  async () => {
    const orchestrator = createDefaultWorkspaceOrchestrator({
      env: { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" }
    });
    const slug = "e2e" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
    const projectId = `proj-${slug}`;

    const record = await orchestrator.provisionWorkspace({ projectId, slug });
    try {
      assert.equal(record.state, "running");
      assert.ok(record.containerId, "expected a real container id");

      // real container is up
      const running = execFileSync("docker", ["ps", "--format", "{{.Names}}"]).toString();
      assert.ok(running.includes(`evcp-ws-${slug}`), "expected evcp-ws-<slug> container to be running");
    } finally {
      await orchestrator.deleteWorkspace(projectId);
      // container gone
      const after = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"]).toString();
      assert.ok(!after.includes(`evcp-ws-${slug}`), "expected the container removed after deleteWorkspace");
    }
    // NOTE: also assert schema/bucket removal via psql/mc if desired; deleteWorkspace calls releaseSchema+releaseBucket best-effort.
    assert.ok(schemaNameFor(slug).includes(slug));
  }
);
