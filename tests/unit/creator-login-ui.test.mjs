import test from "node:test";
import assert from "node:assert/strict";

const { persistLoginSession, needsPasswordChange } = await import(
  "../../apps/creator-web/src/main.tsx"
);

test("persistLoginSession stores token + expiry", () => {
  const store = new Map();
  persistLoginSession(
    { token: "evcp_session.x", expiresAt: "2026-07-07T10:00:00Z", mustChangePassword: false },
    {
      setItem: (k, v) => store.set(k, v)
    }
  );
  assert.equal(store.get("evcp_session"), "evcp_session.x");
  assert.equal(store.get("evcp_session_expires_at"), "2026-07-07T10:00:00Z");
});

test("needsPasswordChange reflects the flag", () => {
  assert.equal(needsPasswordChange({ token: "t", expiresAt: "e", mustChangePassword: true }), true);
  assert.equal(
    needsPasswordChange({ token: "t", expiresAt: "e", mustChangePassword: false }),
    false
  );
});
