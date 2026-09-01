import test from "node:test";
import assert from "node:assert/strict";

const {
  buildSubdomainUrl,
  normalizeSubdomainSuggestion,
  subdomainFromHostname,
  validateSubdomainLabel
} = await import("../../packages/api-client/src/publish-subdomain.ts");

test("normalizes a project name and falls back to the resource key", () => {
  assert.equal(normalizeSubdomainSuggestion("Sales KPI Board", "prj-42"), "sales-kpi-board");
  assert.equal(normalizeSubdomainSuggestion("สวัสดี", "prj-42"), "prj-42");
  assert.equal(normalizeSubdomainSuggestion("A---B", "prj-42"), "a-b");
});

test("rejects malformed and reserved labels", () => {
  for (const label of ["ab", "Admin", "admin", "-sales", "sales-", "sales--ops", "sales.ops"])
    assert.equal(validateSubdomainLabel(label).ok, false, label);
  assert.deepEqual(validateSubdomainLabel("sales-2026"), { ok: true, value: "sales-2026" });
});

test("extracts only a direct child of the configured base domain", () => {
  assert.equal(subdomainFromHostname("sales.localhost", "localhost"), "sales");
  assert.equal(subdomainFromHostname("sales.apps.example.com", "apps.example.com"), "sales");
  assert.equal(subdomainFromHostname("deep.sales.localhost", "localhost"), null);
  assert.equal(subdomainFromHostname("localhost", "localhost"), null);
});

test("builds server-owned local and TLS URLs", () => {
  assert.equal(
    buildSubdomainUrl("sales", { baseDomain: "localhost", port: 9800 }),
    "http://sales.localhost:9800"
  );
  assert.equal(
    buildSubdomainUrl("sales", { baseDomain: "apps.example.com", secure: true }),
    "https://sales.apps.example.com"
  );
});
