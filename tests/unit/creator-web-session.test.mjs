import test from "node:test";
import assert from "node:assert/strict";

const {
  persistLoginSession,
  needsPasswordChange,
  clearLoginSession,
  platformSessionToken,
  hasValidSession,
  canEnterWorkspace,
  vibeAuthHeaders
} = await import("../../apps/creator-web/src/shared/session.ts");

function createFakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    _store: store
  };
}

test("persistLoginSession: writes token and expiry to the given storage", () => {
  const storage = createFakeStorage();
  persistLoginSession({ token: "tok_123", expiresAt: "2026-08-01T00:00:00.000Z" }, storage);
  assert.equal(storage._store.evcp_session, "tok_123");
  assert.equal(storage._store.evcp_session_expires_at, "2026-08-01T00:00:00.000Z");
});

test("needsPasswordChange: reflects the mustChangePassword flag exactly", () => {
  assert.equal(needsPasswordChange({ mustChangePassword: true }), true);
  assert.equal(needsPasswordChange({ mustChangePassword: false }), false);
});

test("clearLoginSession: removes both session keys from the given storage", () => {
  const storage = createFakeStorage({
    evcp_session: "tok_123",
    evcp_session_expires_at: "2026-08-01T00:00:00.000Z"
  });
  clearLoginSession(storage);
  assert.equal("evcp_session" in storage._store, false);
  assert.equal("evcp_session_expires_at" in storage._store, false);
});

test("platformSessionToken / hasValidSession / vibeAuthHeaders: use window.localStorage", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage();
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(platformSessionToken(), undefined);
  assert.equal(hasValidSession(), false);
  assert.deepEqual(vibeAuthHeaders(), { "content-type": "application/json" });

  storage.setItem("evcp_session", "tok_abc");
  storage.setItem("evcp_session_expires_at", new Date(Date.now() + 60_000).toISOString());

  assert.equal(platformSessionToken(), "tok_abc");
  assert.equal(hasValidSession(), true);
  assert.deepEqual(vibeAuthHeaders(), {
    "content-type": "application/json",
    authorization: "Bearer tok_abc"
  });
});

test("vibeAuthHeaders: preserves an already-prefixed Bearer token", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage({ evcp_session: "Bearer tok_xyz" });
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.deepEqual(vibeAuthHeaders(), {
    "content-type": "application/json",
    authorization: "Bearer tok_xyz"
  });
});

test("hasValidSession: returns false once the token has expired", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage({
    evcp_session: "tok_abc",
    evcp_session_expires_at: new Date(Date.now() - 60_000).toISOString()
  });
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(hasValidSession(), false);
});

test("canEnterWorkspace: true when the access token is still valid", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage({
    evcp_session: "tok_abc",
    evcp_session_expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(canEnterWorkspace(), true);
});

test("canEnterWorkspace: true when the access token expired but a valid refresh token remains", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage({
    evcp_session: "tok_abc",
    evcp_session_expires_at: new Date(Date.now() - 60_000).toISOString(),
    evcp_refresh_token: "refresh_abc",
    evcp_refresh_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(canEnterWorkspace(), true);
});

test("canEnterWorkspace: false when both the access token and refresh token have expired", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage({
    evcp_session: "tok_abc",
    evcp_session_expires_at: new Date(Date.now() - 60_000).toISOString(),
    evcp_refresh_token: "refresh_abc",
    evcp_refresh_expires_at: new Date(Date.now() - 1_000).toISOString()
  });
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(canEnterWorkspace(), false);
});

test("canEnterWorkspace: false with no session at all", async (t) => {
  const originalWindow = globalThis.window;
  const storage = createFakeStorage();
  globalThis.window = { localStorage: storage };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  assert.equal(canEnterWorkspace(), false);
});
