import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

// buildImage builds a lean context tar INSIDE the container then pulls it via `GET /archive`, which
// wraps the file in an outer tar. Produce a realistic outer tar for the mock (COPYFILE_DISABLE keeps
// macOS from adding `._` AppleDouble junk the Linux daemon never emits).
function outerTarWrapping(innerBytes) {
  const dir = mkdtempSync(join(tmpdir(), "octx-"));
  writeFileSync(join(dir, "evcp-build-context.tar"), innerBytes);
  return execFileSync("tar", ["-cf", "-", "-C", dir, "evcp-build-context.tar"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    maxBuffer: 64 * 1024 * 1024
  });
}

// A mock `request` that satisfies the exec sequence buildImage runs (create/start/inspect) plus the
// archive GET, delegating the /build response to the caller.
function execAwareRequest(handleBuild, opts = {}) {
  const calls = [];
  const request = async ({ method, path, body, contentType }) => {
    calls.push({ method, path, contentType, isBuffer: Buffer.isBuffer(body) });
    if (method === "POST" && path.endsWith("/exec")) {
      return { status: 201, json: async () => ({ Id: "exec-1" }) };
    }
    if (method === "POST" && /\/exec\/.*\/start$/.test(path)) {
      return { status: 200, text: opts.execStdout ?? "EVCP_CONTEXT_OK\n", json: async () => ({}) };
    }
    if (method === "GET" && /\/exec\/.*\/json$/.test(path)) {
      return { status: 200, json: async () => ({ ExitCode: 0 }) };
    }
    if (method === "GET" && path.includes("/archive")) {
      const inner = opts.inner ?? Buffer.from("INNER-CONTEXT-TAR");
      return { status: 200, buffer: async () => outerTarWrapping(inner), json: async () => ({}) };
    }
    if (path.startsWith("/build")) {
      return handleBuild();
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { request, calls };
}

const spec = {
  name: "evcp-ws-demo", image: "img", env: [],
  hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
  labels: {}, exposedPort: 3000, publishPorts: false
};

test("memory docker engine records commit calls and returns an image id", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer(spec);
  const result = await engine.commitContainer(containerId, "evcp-prod-demo:abc123");
  assert.match(result.imageId, /^mem-image-/);
  assert.deepEqual(engine.state.commits, [{ containerId, imageTag: "evcp-prod-demo:abc123" }]);
});

test("docker socket engine commitContainer posts /commit with repo+tag and returns Id", async () => {
  const calls = [];
  const request = async ({ method, path }) => {
    calls.push({ method, path });
    if (path.startsWith("/commit")) {
      return { status: 201, json: async () => ({ Id: "sha256:deadbeef" }) };
    }
    throw new Error(`unexpected path ${path}`);
  };
  const engine = createDockerSocketEngine({ request });
  const result = await engine.commitContainer("c1", "evcp-prod-demo:abc123");
  assert.equal(result.imageId, "sha256:deadbeef");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/commit\?container=c1&repo=evcp-prod-demo&tag=abc123$/);
});

test("memory docker engine records buildImage calls and returns an image id", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer(spec);
  const result = await engine.buildImage(containerId, "evcp-production-demo:abc123", "Dockerfile", [
    { name: "Dockerfile", content: "FROM node:20-alpine\n" }
  ]);
  assert.match(result.imageId, /^mem-build-/);
  assert.deepEqual(engine.state.builds, [
    {
      containerId,
      imageTag: "evcp-production-demo:abc123",
      dockerfilePath: "Dockerfile",
      extraFiles: ["Dockerfile"]
    }
  ]);
});

test("docker socket engine buildImage builds a lean context tar, pulls it, then POSTs /build", async () => {
  const { request, calls } = execAwareRequest(() => {
    const stream = [
      '{"stream":"Step 1/7 : FROM node:20-alpine"}',
      '{"stream":"Successfully built abc"}',
      '{"aux":{"ID":"sha256:cafebabe"}}'
    ].join("\n");
    return { status: 200, text: stream, json: async () => ({}) };
  });
  const engine = createDockerSocketEngine({ request });
  const result = await engine.buildImage("dev-c1", "evcp-production-demo:abc123");

  assert.equal(result.imageId, "sha256:cafebabe");
  // The lean tar is created via exec (excluding node_modules/.next/.git), NOT by archiving raw
  // /workspace — that would OOM the API. Verify the exec command builds the temp context tar.
  const execStart = calls.find((c) => c.path.endsWith("/exec"));
  assert.ok(execStart, "expected an exec-create call");
  // The archive pulls the temp context file (not /workspace/.).
  const archive = calls.find((c) => c.method === "GET" && c.path.includes("/archive"));
  assert.match(archive.path, /archive\?path=%2Ftmp%2Fevcp-build-context\.tar$/);
  // build POSTs the (injected) context tar as x-tar with the tag + Dockerfile.
  const build = calls.find((c) => c.path.startsWith("/build"));
  assert.equal(build.contentType, "application/x-tar");
  assert.equal(build.isBuffer, true);
  assert.match(build.path, /^\/build\?t=evcp-production-demo%3Aabc123&dockerfile=Dockerfile&rm=true$/);
});

test("docker socket engine buildImage throws with the build log when the daemon emits an error frame", async () => {
  const { request } = execAwareRequest(() => {
    const stream = [
      '{"stream":"Step 2/7 : RUN npm ci"}',
      '{"error":"The command \'/bin/sh -c npm ci\' returned a non-zero code: 1","errorDetail":{"code":1}}'
    ].join("\n");
    return { status: 200, text: stream, json: async () => ({}) };
  });
  const engine = createDockerSocketEngine({ request });
  await assert.rejects(
    () => engine.buildImage("dev-c1", "evcp-production-demo:abc123"),
    /docker engine build failed for 'evcp-production-demo:abc123'[\s\S]*non-zero code: 1/
  );
});

test("docker socket engine buildImage throws if the lean context tar step fails", async () => {
  const { request } = execAwareRequest(() => ({ status: 200, text: "{}", json: async () => ({}) }), {
    execStdout: "tar: permission denied\n"
  });
  const engine = createDockerSocketEngine({ request });
  await assert.rejects(
    () => engine.buildImage("dev-c1", "evcp-production-demo:abc123"),
    /failed to build lean context tar/
  );
});
