import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProdContainerSpec,
  buildAppContainerSpec
} from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

test("prod spec uses evcp-production- name, NODE_ENV=production, defaults CPU 1/RAM 1GB, no host ports", () => {
  const spec = buildProdContainerSpec({
    slug: "my-app",
    image: "evcp-production-my-app:abc123",
    env: { DATABASE_URL: "postgres://x", S3_BUCKET: "proj-my-app" },
    network: "evcp-internal"
  });
  assert.equal(spec.name, "evcp-production-my-app");
  assert.equal(spec.publishPorts, false);
  assert.equal(spec.exposedPort, 3000);
  assert.equal(spec.hostConfig.NanoCpus, 1_000_000_000);
  assert.equal(spec.hostConfig.Memory, 1024 * 1024 * 1024);
  assert.ok(spec.env.includes("NODE_ENV=production"));
  assert.ok(spec.env.includes("DATABASE_URL=postgres://x"));
  assert.equal(spec.labels["evcp.env"], "production");
  assert.deepEqual(spec.hostConfig.Binds, []);
});

test("prod spec honours explicit cpu/memory overrides", () => {
  const spec = buildProdContainerSpec({
    slug: "app2", image: "img", env: {}, network: "n",
    cpuCores: 2, memoryMb: 2048
  });
  assert.equal(spec.hostConfig.NanoCpus, 2_000_000_000);
  assert.equal(spec.hostConfig.Memory, 2048 * 1024 * 1024);
});

test("buildAppContainerSpec parametrizes name and label while keeping the image filesystem immutable", () => {
  const staging = buildAppContainerSpec(
    {
      projectId: "prj_123",
      slug: "my-app",
      image: "evcp-staging-my-app:sha",
      env: { DATABASE_URL: "postgres://x" },
      network: "evcp-internal"
    },
    "staging"
  );
  assert.equal(staging.name, "evcp-staging-my-app");
  assert.equal(staging.labels["evcp.env"], "staging");
  assert.equal(staging.labels["evcp.project-id"], "prj_123");
  assert.deepEqual(staging.hostConfig.Binds, []);
  // NODE_ENV is production in every deployed tier (runs the production build)
  assert.ok(staging.env.includes("NODE_ENV=production"));

  const prod = buildAppContainerSpec(
    { slug: "my-app", image: "img", env: {}, network: "evcp-internal" },
    "production"
  );
  assert.equal(prod.name, "evcp-production-my-app");
  assert.equal(prod.labels["evcp.env"], "production");
  assert.deepEqual(prod.hostConfig.Binds, []);
});
