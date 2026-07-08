import test from "node:test";
import assert from "node:assert/strict";

const {
  bucketNameFor,
  createMemoryObjectStorageProvisioner,
  createMemoryLlmGatewayAdmin,
  createLiteLlmGatewayAdmin
} = await import("../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts");

test("bucket naming follows proj-{slug}", () => {
  assert.equal(bucketNameFor("leave-tracker"), "proj-leave-tracker");
  assert.throws(() => bucketNameFor("BAD SLUG"));
});

test("memory object storage provisions and releases buckets", async () => {
  const storage = createMemoryObjectStorageProvisioner();
  const created = await storage.provisionBucket("leave-tracker");
  assert.equal(created.bucket, "proj-leave-tracker");
  assert.ok(created.accessKey.length > 0);
  assert.ok(created.secretKey.length >= 32);
  assert.deepEqual(storage.state.buckets, ["proj-leave-tracker"]);
  await storage.releaseBucket("leave-tracker");
  assert.deepEqual(storage.state.buckets, []);
});

test("memory llm gateway issues and revokes virtual keys", async () => {
  const gateway = createMemoryLlmGatewayAdmin();
  const issued = await gateway.createVirtualKey({ projectId: "p1", slug: "leave-tracker", maxBudgetUsd: 25 });
  assert.match(issued.key, /^sk-/);
  assert.equal(gateway.state.keys.length, 1);
  await gateway.revokeVirtualKey(issued.keyId);
  assert.equal(gateway.state.keys[0].revoked, true);
});

test("litellm admin client calls /key/generate with master key auth", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ key: "sk-litellm-abc", token_id: "tok_1" }), { status: 200 });
  };
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: fakeFetch
  });
  const issued = await gateway.createVirtualKey({ projectId: "p1", slug: "leave-tracker", maxBudgetUsd: 25 });
  assert.equal(issued.key, "sk-litellm-abc");
  assert.equal(issued.keyId, "tok_1");
  assert.equal(calls[0].url, "http://litellm:4000/key/generate");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-master");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.key_alias, "proj-leave-tracker");
  assert.equal(body.max_budget, 25);
  assert.deepEqual(body.metadata, { evcpProjectId: "p1" });
});

test("litellm admin client surfaces non-200 as error", async () => {
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: async () => new Response("nope", { status: 401 })
  });
  await assert.rejects(
    () => gateway.createVirtualKey({ projectId: "p1", slug: "leave-tracker" }),
    /litellm key generation failed \(401\)/
  );
});

test("litellm admin client calls /key/delete with master key auth", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: fakeFetch
  });
  await gateway.revokeVirtualKey("tok_1");
  assert.equal(calls[0].url, "http://litellm:4000/key/delete");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-master");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, { keys: ["tok_1"] });
});

test("litellm admin client surfaces non-200 revoke as error", async () => {
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: async () => new Response("nope", { status: 500 })
  });
  await assert.rejects(
    () => gateway.revokeVirtualKey("tok_1"),
    /litellm key revoke failed \(500\)/
  );
});
