import assert from "node:assert/strict";
import test from "node:test";

const { createSessionAwareFetch, createPlatformApiClient, createPlatformSessionStore } = await import("../../packages/api-client/src/index.ts");

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("session-aware client refreshes once after a 401 and retries with the rotated access token", async () => {
  const storage = memoryStorage();
  createPlatformSessionStore(storage).saveSession({ token: "old", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  const seen = [];
  const client = createPlatformApiClient({ baseUrl: "https://api.example.test", fetcher: createSessionAwareFetch({ baseUrl: "https://api.example.test", storage, fetcher: async (url, init) => {
    seen.push([String(url), new Headers(init?.headers).get("authorization")]);
    if (String(url).endsWith("/auth/refresh")) return json({ ok: true, data: { token: "new", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: "new-refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
    return seen.filter(([path]) => path.endsWith("/auth/me")).length === 1 ? new Response(JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "expired" } }), { status: 401 }) : json({ ok: true, data: { user: { id: "u", email: "u@example.test", name: "U", role: "creator" }, auth: { mode: "platform_session" } } });
  } }) });
  await client.getCurrentUser();
  assert.deepEqual(seen.map(([path, authorization]) => [path.endsWith("/auth/refresh") ? "refresh" : "me", authorization]), [["me", "Bearer old"], ["refresh", null], ["me", "Bearer new"]]);
});

test("session-aware client clears local credentials when refresh is rejected", async () => {
  const storage = memoryStorage();
  createPlatformSessionStore(storage).saveSession({ token: "old", expiresAt: new Date(Date.now() - 1).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let ended = 0;
  const client = createPlatformApiClient({ baseUrl: "https://api.example.test", fetcher: createSessionAwareFetch({ baseUrl: "https://api.example.test", storage, onSessionEnded: () => { ended += 1; }, fetcher: async () => new Response(JSON.stringify({ ok: false }), { status: 401 }) }) });
  await assert.rejects(() => client.getCurrentUser());
  assert.equal(createPlatformSessionStore(storage).getToken(), undefined);
  assert.equal(ended, 1);
});

function json(body) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
