import test from "node:test";
import assert from "node:assert/strict";

const { fetchProviderModelCatalog, handleProviderCatalogRoute } = await import(
  "../../apps/platform-api/src/ai-governance/provider-catalog.ts"
);

const admin = { id: "u1", email: "admin@example.test", name: "Admin", role: "admin" };
const creator = { id: "u2", email: "c@example.test", name: "Creator", role: "creator" };

test("fetchProviderModelCatalog maps data[] to id/name/contextLength and sorts by id", async () => {
  let observed;
  const catalog = await fetchProviderModelCatalog({
    baseUrl: "https://openrouter.ai/api/v1/",
    fetcher: async (url, init) => {
      observed = { url: String(url), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization") };
      return new Response(JSON.stringify({ data: [
        { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini", context_length: 128000 },
        { id: "a/model", context_length: 0 }
      ] }), { status: 200 });
    }
  });
  assert.equal(observed.url, "https://openrouter.ai/api/v1/models");
  assert.equal(observed.method, "GET");
  assert.equal(observed.auth, null); // no credential sent
  assert.equal(catalog.models.length, 2);
  assert.deepEqual(catalog.models[0], { id: "a/model", name: "a/model" }); // sorted first; name defaults to id; contextLength 0 dropped
  assert.deepEqual(catalog.models[1], { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini", contextLength: 128000 });
});

test("fetchProviderModelCatalog throws on non-2xx", async () => {
  await assert.rejects(
    () => fetchProviderModelCatalog({ baseUrl: "https://x/v1", fetcher: async () => new Response("nope", { status: 500 }) }),
    /HTTP 500/
  );
});

test("fetchProviderModelCatalog throws on transport error", async () => {
  await assert.rejects(
    () => fetchProviderModelCatalog({ baseUrl: "https://x/v1", fetcher: async () => { throw new Error("ECONNREFUSED"); } }),
    /Model catalog request failed/
  );
});

test("handleProviderCatalogRoute forbids non-admin", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: { baseUrl: "https://x/v1" } },
    user: creator,
    fetcher: async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
});

test("handleProviderCatalogRoute returns 400 when baseUrl missing", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: {} },
    user: admin
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test("handleProviderCatalogRoute returns catalog for admin", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: { baseUrl: "https://openrouter.ai/api/v1" } },
    user: admin,
    fetcher: async () => new Response(JSON.stringify({ data: [{ id: "a/b", name: "A B" }] }), { status: 200 })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.models[0].id, "a/b");
});
