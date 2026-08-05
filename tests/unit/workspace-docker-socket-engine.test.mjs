import test from "node:test";
import assert from "node:assert/strict";

const { createDockerSocketEngine, buildCreateContainerBody } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts"
);
const { buildDevContainerSpec } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

const spec = buildDevContainerSpec({
  projectId: "prj_leave_tracker",
  slug: "leave-tracker",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "postgresql://x", S3_BUCKET: "proj-leave-tracker" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-leave-tracker-data"
});

test("buildCreateContainerBody maps the spec to Docker API shape without port publishing", () => {
  const body = buildCreateContainerBody(spec);
  assert.equal(body.Image, "evcp/workspace-next:1");
  assert.ok(Array.isArray(body.Env) && body.Env.includes("DATABASE_URL=postgresql://x"));
  assert.equal(body.HostConfig.NanoCpus, 1_000_000_000);
  assert.equal(body.HostConfig.Memory, 2048 * 1024 * 1024);
  assert.equal(body.HostConfig.NetworkMode, "evcp-internal");
  assert.deepEqual(body.HostConfig.Binds, ["evcp-ws-leave-tracker-data:/workspace"]);
  assert.equal(body.Labels["evcp.project-slug"], "leave-tracker");
  assert.ok(!("PortBindings" in body.HostConfig), "must never publish host ports");
});

test("createContainer POSTs to /containers/create with ?name and returns id", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path, body }) => {
      calls.push({ method, path, body });
      if (path.startsWith("/containers/create")) {
        return { status: 201, json: async () => ({ Id: "abc123" }) };
      }
      return { status: 204, json: async () => ({}) };
    }
  });
  const { containerId } = await engine.createContainer(spec);
  assert.equal(containerId, "abc123");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/containers\/create\?name=evcp-ws-leave-tracker$/);
  assert.equal(calls[0].body.Image, "evcp/workspace-next:1");
});

test("start/stop/remove hit the right endpoints", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path }) => {
      calls.push(`${method} ${path}`);
      return { status: 204, json: async () => ({}) };
    }
  });
  await engine.startContainer("abc123");
  await engine.stopContainer("abc123");
  await engine.removeContainer("abc123");
  assert.deepEqual(calls, [
    "POST /containers/abc123/start",
    "POST /containers/abc123/stop",
    "DELETE /containers/abc123?force=true"
  ]);
});

test("managed volume lifecycle uses labelled Docker volumes and idempotent removal", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path, body }) => {
      calls.push({ method, path, body });
      if (path.startsWith("/volumes?")) {
        return {
          status: 200,
          json: async () => ({
            Volumes: [{ Name: "evcp-ws-prj-1-data", Labels: { "evcp.managed": "true" } }]
          })
        };
      }
      return { status: method === "POST" ? 201 : 204, json: async () => ({}) };
    }
  });

  await engine.ensureVolume("evcp-ws-prj-1-data", {
    "evcp.managed": "true",
    "evcp.project-id": "prj_1"
  });
  assert.deepEqual(await engine.listManagedVolumes(), [
    {
      name: "evcp-ws-prj-1-data",
      labels: { "evcp.managed": "true" }
    }
  ]);
  await engine.removeVolume("evcp-ws-prj-1-data");

  assert.deepEqual(calls[0], {
    method: "POST",
    path: "/volumes/create",
    body: {
      Name: "evcp-ws-prj-1-data",
      Labels: { "evcp.managed": "true", "evcp.project-id": "prj_1" }
    }
  });
  assert.match(calls[1].path, /^\/volumes\?filters=/);
  assert.equal(calls[2].path, "/volumes/evcp-ws-prj-1-data?force=false");
});

test("inspectContainer returns image and management labels needed to restore deployed routing", async () => {
  const engine = createDockerSocketEngine({
    request: async () => ({
      status: 200,
      json: async () => ({
        Id: "container-123",
        State: { Running: true },
        Config: {
          Image: "evcp-staging-prj-123:abc123",
          Labels: {
            "evcp.managed": "true",
            "evcp.project-id": "prj_123",
            "evcp.project-slug": "prj-123",
            "evcp.env": "staging"
          },
          Env: ["NODE_ENV=production"]
        }
      })
    })
  });

  assert.deepEqual(await engine.inspectContainer("evcp-staging-prj-123"), {
    containerId: "container-123",
    running: true,
    image: "evcp-staging-prj-123:abc123",
    labels: {
      "evcp.managed": "true",
      "evcp.project-id": "prj_123",
      "evcp.project-slug": "prj-123",
      "evcp.env": "staging"
    },
    env: ["NODE_ENV=production"]
  });
});

test("inspectContainer resolves a running Swarm task by service label when no exact container name exists", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ path }) => {
      calls.push(path);
      if (path === "/containers/evcp_minio/json") {
        return { status: 404, json: async () => ({ message: "No such container" }) };
      }
      if (path.startsWith("/containers/json?all=true&filters=")) {
        return {
          status: 200,
          json: async () => [{
            Id: "minio-task-123",
            State: "running",
            Labels: { "com.docker.swarm.service.name": "evcp_minio" }
          }]
        };
      }
      if (path === "/containers/minio-task-123/json") {
        return {
          status: 200,
          json: async () => ({
            Id: "minio-task-123",
            State: { Running: true },
            Config: {
              Image: "minio/minio:release",
              Labels: { "com.docker.swarm.service.name": "evcp_minio" },
              Env: []
            }
          })
        };
      }
      return { status: 500, json: async () => ({ message: `unexpected path: ${path}` }) };
    }
  });

  assert.deepEqual(await engine.inspectContainer("evcp_minio"), {
    containerId: "minio-task-123",
    running: true,
    image: "minio/minio:release",
    labels: { "com.docker.swarm.service.name": "evcp_minio" },
    env: []
  });
  assert.equal(calls[0], "/containers/evcp_minio/json");
  const filters = JSON.parse(decodeURIComponent(calls[1].split("filters=")[1]));
  assert.deepEqual(filters, { label: ["com.docker.swarm.service.name=evcp_minio"] });
  assert.equal(calls[2], "/containers/minio-task-123/json");
});

test("listManagedContainers uses the managed label filter and normalizes Docker names", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ path }) => {
      calls.push(path);
      return {
        status: 200,
        json: async () => [{
          Id: "container-123",
          Names: ["/evcp-ws-prj-123"],
          State: "exited",
          Labels: { "evcp.managed": "true", "evcp.project-id": "prj_123" }
        }]
      };
    }
  });

  assert.deepEqual(await engine.listManagedContainers(), [{
    containerId: "container-123",
    name: "evcp-ws-prj-123",
    running: false,
    labels: { "evcp.managed": "true", "evcp.project-id": "prj_123" }
  }]);
  assert.match(calls[0], /^\/containers\/json\?all=true&filters=/);
});

test("non-2xx throws a descriptive error", async () => {
  const engine = createDockerSocketEngine({
    request: async () => ({ status: 500, json: async () => ({ message: "boom" }) })
  });
  await assert.rejects(() => engine.startContainer("abc123"), /docker engine start failed \(500\)/);
});

test("createContainer recovers from a 409 name conflict by removing then retrying once", async () => {
  const calls = [];
  let createAttempts = 0;
  const engine = createDockerSocketEngine({
    request: async ({ method, path }) => {
      calls.push(`${method} ${path}`);
      if (path.startsWith("/containers/create")) {
        createAttempts += 1;
        if (createAttempts === 1) return { status: 409, json: async () => ({ message: "name in use" }) };
        return { status: 201, json: async () => ({ Id: "abc123" }) };
      }
      return { status: 204, json: async () => ({}) };
    }
  });
  const { containerId } = await engine.createContainer(spec);
  assert.equal(containerId, "abc123");
  // must have: create(409) -> delete by name -> create(201)
  assert.equal(createAttempts, 2);
  assert.ok(calls.some((c) => c.startsWith("DELETE /containers/evcp-ws-leave-tracker")), "removed stale container by name");
});

test("error message includes the daemon message", async () => {
  const engine = createDockerSocketEngine({
    request: async () => ({ status: 500, json: async () => ({ message: "disk full" }) })
  });
  await assert.rejects(() => engine.startContainer("abc123"), /docker engine start failed \(500\).*disk full/s);
});
