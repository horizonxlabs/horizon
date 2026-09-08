import test from "node:test";
import assert from "node:assert/strict";

const { persistLoginSession, needsPasswordChange } =
  await import("../../apps/creator-web/src/shared/session.ts");
const { beginCreatorKeycloakLogin } =
  await import("../../apps/creator-web/src/app/creator-app-helpers.ts");

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

test("Creator login returns to the creator page where sign-in started", () => {
  const previousWindow = globalThis.window;
  let assignedUrl;
  globalThis.window = {
    location: {
      href: "https://dash.gethorizon.org/creator/projects/prj_example",
      assign(url) {
        assignedUrl = url;
      }
    }
  };

  try {
    beginCreatorKeycloakLogin();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  const loginUrl = new URL(assignedUrl, "https://dash.gethorizon.org");
  assert.equal(loginUrl.pathname, "/api/auth/keycloak/start");
  assert.equal(loginUrl.searchParams.get("app"), "creator");
  assert.equal(
    loginUrl.searchParams.get("returnTo"),
    "https://dash.gethorizon.org/creator/projects/prj_example"
  );
});
