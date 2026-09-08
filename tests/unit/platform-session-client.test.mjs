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

test("session-aware fetch instances coordinate one refresh for concurrent requests", async () => {
  const storage = memoryStorage();
  const sessions = createPlatformSessionStore(storage);
  sessions.saveSession({ token: "old", expiresAt: new Date(Date.now() + 1_000).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let refreshCalls = 0;
  const fetcher = async (url) => {
    if (!String(url).endsWith("/auth/refresh")) return json({ ok: true, data: {} });
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return json({ ok: true, data: { token: `new-${refreshCalls}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: `new-refresh-${refreshCalls}`, refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
  };
  const first = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage, fetcher });
  const second = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage, fetcher });

  await Promise.all([first("https://api.example.test/projects"), second("https://api.example.test/current-user")]);

  assert.equal(refreshCalls, 1);
  assert.equal(sessions.getToken(), "new-1");
});

test("session-aware fetch coordinates refresh across browser tabs", async () => {
  const values = new Map();
  const storageView = () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) });
  const firstStorage = storageView();
  const secondStorage = storageView();
  const sessions = createPlatformSessionStore(firstStorage);
  sessions.saveSession({ token: "old", expiresAt: new Date(Date.now() + 1_000).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let lockTail = Promise.resolve();
  const lockManager = { request: (_name, callback) => {
    const result = lockTail.then(callback);
    lockTail = result.then(() => undefined, () => undefined);
    return result;
  } };
  let refreshCalls = 0;
  const fetcher = async (url) => {
    if (!String(url).endsWith("/auth/refresh")) return json({ ok: true, data: {} });
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return json({ ok: true, data: { token: "new", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: "new-refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
  };
  const first = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage: firstStorage, fetcher, lockManager });
  const second = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage: secondStorage, fetcher, lockManager });

  await Promise.all([first("https://api.example.test/projects"), second("https://api.example.test/current-user")]);

  assert.equal(refreshCalls, 1);
  assert.equal(sessions.getToken(), "new");
});

test("a losing concurrent refresh never clears the session rotated by another browser context", async () => {
  const values = new Map();
  const storageView = () => ({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) });
  const firstStorage = storageView();
  const secondStorage = storageView();
  const sessions = createPlatformSessionStore(firstStorage);
  sessions.saveSession({ token: "old", expiresAt: new Date(Date.now() + 1_000).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let refreshCalls = 0;
  let ended = 0;
  const fetcher = async (url) => {
    if (!String(url).endsWith("/auth/refresh")) return json({ ok: true, data: {} });
    refreshCalls += 1;
    if (refreshCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return json({ ok: true, data: { token: "new", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshToken: "new-refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() } });
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  };
  const first = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage: firstStorage, fetcher, lockManager: null });
  const second = createSessionAwareFetch({ baseUrl: "https://api.example.test", storage: secondStorage, fetcher, lockManager: null, onSessionEnded: () => { ended += 1; } });

  await Promise.all([first("https://api.example.test/projects"), second("https://api.example.test/current-user")]);

  assert.equal(refreshCalls, 2);
  assert.equal(sessions.getToken(), "new");
  assert.equal(sessions.getRefreshToken(), "new-refresh");
  assert.equal(ended, 0);
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

test("session-aware client preserves credentials when refresh service is unavailable", async () => {
  const storage = memoryStorage();
  const sessions = createPlatformSessionStore(storage);
  sessions.saveSession({ token: "old", expiresAt: new Date(Date.now() - 1).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let ended = 0;
  const client = createPlatformApiClient({ baseUrl: "https://api.example.test", fetcher: createSessionAwareFetch({
    baseUrl: "https://api.example.test",
    storage,
    onSessionEnded: () => { ended += 1; },
    fetcher: async () => new Response(JSON.stringify({ ok: false }), { status: 503 })
  }) });

  await assert.rejects(() => client.getCurrentUser());

  assert.equal(sessions.getToken(), "old");
  assert.equal(sessions.getRefreshToken(), "refresh");
  assert.equal(ended, 0);
});

test("session-aware client preserves credentials when refresh hits a network error", async () => {
  const storage = memoryStorage();
  const sessions = createPlatformSessionStore(storage);
  sessions.saveSession({ token: "old", expiresAt: new Date(Date.now() - 1).toISOString(), refreshToken: "refresh", refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  let ended = 0;
  const client = createPlatformApiClient({ baseUrl: "https://api.example.test", fetcher: createSessionAwareFetch({
    baseUrl: "https://api.example.test",
    storage,
    onSessionEnded: () => { ended += 1; },
    fetcher: async () => { throw new TypeError("network unavailable"); }
  }) });

  await assert.rejects(() => client.getCurrentUser(), /network unavailable/);

  assert.equal(sessions.getToken(), "old");
  assert.equal(sessions.getRefreshToken(), "refresh");
  assert.equal(ended, 0);
});

function json(body) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }
