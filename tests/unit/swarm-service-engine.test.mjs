import test from "node:test";
import assert from "node:assert/strict";
import { createSwarmServiceEngine } from "../../apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts";

function stub(routes) {
  const calls = [];
  const request = async ({ method, path, body }) => {
    calls.push({ method, path, body });
    const r = routes(method, path);
    return { status: r.status ?? 200, json: async () => r.json };
  };
  return { request, calls };
}

test("listStackServices filters by stack namespace and maps id/name/image", async () => {
  const { request, calls } = stub(() => ({
    json: [{ ID: "abc", Spec: { Name: "evcp_admin-web", TaskTemplate: { ContainerSpec: { Image: "repo/evcp-admin-web:v1" } } } }]
  }));
  const engine = createSwarmServiceEngine({ request });
  const services = await engine.listStackServices("evcp");
  assert.match(decodeURIComponent(calls[0].path), /com\.docker\.stack\.namespace=evcp/);
  assert.deepEqual(services, [{ id: "abc", name: "evcp_admin-web", image: "repo/evcp-admin-web:v1" }]);
});

test("updateServiceImage reads version+spec then POSTs the modified spec at ?version=N", async () => {
  const { request, calls } = stub((method) => {
    if (method === "GET") return { json: { Version: { Index: 42 }, Spec: { Name: "evcp_admin-web", TaskTemplate: { ContainerSpec: { Image: "old" } } } } };
    return { json: {} };
  });
  const engine = createSwarmServiceEngine({ request });
  await engine.updateServiceImage("evcp_admin-web", "repo/evcp-admin-web:v2");
  const post = calls.find((c) => c.method === "POST");
  assert.match(post.path, /\/services\/evcp_admin-web\/update\?version=42/);
  // body MUST be the raw object (nodeSocketRequest JSON-encodes it) — a string here would
  // double-encode against the real transport and the daemon would reject it.
  assert.equal(typeof post.body, "object");
  assert.equal(post.body.TaskTemplate.ContainerSpec.Image, "repo/evcp-admin-web:v2");
  assert.equal(post.body.TaskTemplate.ForceUpdate, 1);
});

test("updateServiceImage throws on a Docker error status", async () => {
  const { request } = stub(() => ({ status: 500, json: {} }));
  const engine = createSwarmServiceEngine({ request });
  await assert.rejects(() => engine.updateServiceImage("evcp_admin-web", "x"));
});

test("updateServiceEnv merges the patch into the Env array (replace + append) and posts the raw object", async () => {
  const { request, calls } = stub((method) => {
    if (method === "GET") return { json: { Version: { Index: 7 }, Spec: { Name: "evcp_caddy", TaskTemplate: { ContainerSpec: { Image: "caddy", Env: ["EVCP_CADDY_ADDRESS=:80", "OTHER=x"] } } } } };
    return { json: {} };
  });
  const engine = createSwarmServiceEngine({ request });
  await engine.updateServiceEnv("evcp_caddy", { EVCP_CADDY_ADDRESS: "app.example.com", NEW: "1" });
  const post = calls.find((c) => c.method === "POST");
  assert.match(post.path, /\/services\/evcp_caddy\/update\?version=7/);
  assert.equal(typeof post.body, "object");
  const env = post.body.TaskTemplate.ContainerSpec.Env;
  assert.ok(env.includes("EVCP_CADDY_ADDRESS=app.example.com"));   // replaced
  assert.ok(env.includes("OTHER=x"));                               // preserved
  assert.ok(env.includes("NEW=1"));                                 // appended
  assert.ok(!env.includes("EVCP_CADDY_ADDRESS=:80"));               // old removed
  assert.equal(post.body.TaskTemplate.ForceUpdate, 1);
});
