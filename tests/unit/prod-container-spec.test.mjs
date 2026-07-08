import test from "node:test";
import assert from "node:assert/strict";
import { buildProdContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

test("prod spec uses evcp-prod- name, NODE_ENV=production, defaults CPU 1/RAM 1GB, no host ports", () => {
  const spec = buildProdContainerSpec({
    slug: "my-app",
    image: "evcp-prod-my-app:abc123",
    env: { DATABASE_URL: "postgres://x", S3_BUCKET: "proj-my-app" },
    network: "evcp-internal",
    workspaceVolume: "evcp-ws-my-app-data"
  });
  assert.equal(spec.name, "evcp-prod-my-app");
  assert.equal(spec.publishPorts, false);
  assert.equal(spec.exposedPort, 3000);
  assert.equal(spec.hostConfig.NanoCpus, 1_000_000_000);
  assert.equal(spec.hostConfig.Memory, 1024 * 1024 * 1024);
  assert.ok(spec.env.includes("NODE_ENV=production"));
  assert.ok(spec.env.includes("DATABASE_URL=postgres://x"));
  assert.equal(spec.labels["evcp.env"], "production");
});

test("prod spec honours explicit cpu/memory overrides", () => {
  const spec = buildProdContainerSpec({
    slug: "app2", image: "img", env: {}, network: "n", workspaceVolume: "v",
    cpuCores: 2, memoryMb: 2048
  });
  assert.equal(spec.hostConfig.NanoCpus, 2_000_000_000);
  assert.equal(spec.hostConfig.Memory, 2048 * 1024 * 1024);
});
