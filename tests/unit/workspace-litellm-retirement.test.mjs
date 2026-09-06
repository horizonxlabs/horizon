import assert from "node:assert/strict";
import test from "node:test";
import { createLiteLlmGatewayAdmin } from "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts";
import { createWarmPoolFixture } from "./workspace-warm-pool-fixture.mjs";

// LiteLLM delete_verification_tokens -> handle_exception_on_proxy -> ProxyException.to_dict.
const absent = {
  error: {
    message: "{'error': 'No keys found'}",
    type: "internal_server_error",
    param: "None",
    code: "404"
  }
};

test("the real gateway adapter accepts exact alias absence after deleting its key by ID", async () => {
  let keyExists = true;
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "test-master",
    fetchImpl: async (url, init) => {
      assert.equal(url, "http://litellm:4000/key/delete");
      const body = JSON.parse(init.body);
      if (body.keys) {
        assert.deepEqual(body.keys, ["old-key-id"]);
        keyExists = false;
        return Response.json({ deleted_keys: ["old-key-id"] });
      }
      assert.deepEqual(body, { key_aliases: ["proj-warm-retired"] });
      assert.equal(keyExists, false);
      return Response.json(absent, { status: 404 });
    }
  });
  await gateway.revokeVirtualKey("old-key-id");
  await assert.doesNotReject(() => gateway.revokeVirtualKeysForResource("warm-retired"));
  await assert.doesNotReject(() => gateway.revokeVirtualKeysForResource("warm-retired"));
});

test("actual gateway alias absence retires settled intents and permits repeated ambiguous sweeps", async () => {
  const fixture = createWarmPoolFixture({ targetSize: 0 });
  fixture.deps.llmGateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "test-master",
    fetchImpl: async () => Response.json(absent, { status: 404 })
  });
  await fixture.store.preparations.create({
    resourceKey: "warm-retired",
    slotId: "slot-old",
    operationOwner: "owner-old"
  });
  await fixture.store.preparations.settle("warm-retired");
  await fixture.createPool().reconcile();
  assert.deepEqual(await fixture.store.preparations.list(), []);
  await fixture.store.preparations.create({
    resourceKey: "warm-ambiguous",
    slotId: "slot-ambiguous",
    operationOwner: "owner-ambiguous"
  });
  await fixture.createPool().reconcile();
  await fixture.createPool().reconcile();
  const [intent] = await fixture.store.preparations.list();
  assert.equal(intent.resourceKey, "warm-ambiguous");
  assert.equal(intent.settled, false);
  // A later exact completion boundary makes the same absent cleanup retire the record.
  await fixture.store.preparations.settle("warm-ambiguous");
  await fixture.createPool().reconcile();
  assert.deepEqual(await fixture.store.preparations.list(), []);
});

for (const [label, status, payload] of [
  ["authentication", 401, absent],
  ["authorization", 403, absent],
  ["server", 500, absent],
  ["unrelated missing route", 404, { detail: "Not Found" }],
  [
    "different absence",
    404,
    { error: { ...absent.error, message: "No keys found for team other" } }
  ],
  ["wrong code", 404, { error: { ...absent.error, code: "401" } }],
  ["wrong type", 404, { error: { ...absent.error, type: "authentication_error" } }],
  ["missing envelope fields", 404, { error: { message: "{'error': 'No keys found'}" } }],
  ["unstructured body", 404, "No keys found"]
]) {
  test(`alias retirement preserves ${label} failures`, async () => {
    const gateway = createLiteLlmGatewayAdmin({
      baseUrl: "http://litellm:4000",
      masterKey: "test-master",
      fetchImpl: async () => Response.json(payload, { status })
    });
    await assert.rejects(() => gateway.revokeVirtualKeysForResource("warm-retired"));
  });
}

test("alias retirement preserves malformed JSON and transport failures", async () => {
  for (const fetchImpl of [
    async () => new Response("{not-json", { status: 404 }),
    async () => {
      throw new Error("connection reset");
    }
  ]) {
    const gateway = createLiteLlmGatewayAdmin({
      baseUrl: "http://litellm:4000",
      masterKey: "test-master",
      fetchImpl
    });
    await assert.rejects(() => gateway.revokeVirtualKeysForResource("warm-retired"));
  }
});
