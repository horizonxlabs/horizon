import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient } = await import("../../packages/api-client/src/index.ts");

test("frontend checkpoint methods use the existing encoded lifecycle endpoints", async () => {
  const requests = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    fetcher: async (url, init) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body
      });
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    }
  });

  await client.getFrontendCheckpoints("project/one");
  await client.restoreFrontendCheckpoint("project/one", "checkpoint_2");

  assert.deepEqual(requests, [
    {
      url: "https://platform.example/api/projects/project%2Fone/frontend/checkpoints",
      method: "GET",
      headers: { accept: "application/json" },
      body: undefined
    },
    {
      url: "https://platform.example/api/projects/project%2Fone/frontend/restore",
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ checkpointId: "checkpoint_2" })
    }
  ]);
});

test("deleteProject sends DELETE to the encoded project endpoint", async () => {
  const requests = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    fetcher: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ ok: true, data: { deleted: true } }), { status: 200 });
    }
  });

  await client.deleteProject("project/one");

  assert.deepEqual(requests, [
    { url: "https://platform.example/api/projects/project%2Fone", method: "DELETE" }
  ]);
});
