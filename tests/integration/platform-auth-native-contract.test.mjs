import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTestExecutor, createNativeAuthServices } from "./helpers/auth-native-harness.mjs";
import { executePlatformApiRequestAsync } from "../../apps/platform-api/src/app-factory.ts";
import { createUserWithRole } from "../../apps/platform-api/src/auth/prisma-credential-store.ts";

test("admin can create a native platform user with a temp password", async () => {
  const exec = buildTestExecutor();

  const created = await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "new.creator@company.com",
      name: "New Creator",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.data.email, "new.creator@company.com");
  assert.equal(created.body.data.role, "creator");
  assert.equal(created.body.data.mustChangePassword, true);
  assert.equal("passwordHash" in created.body.data, false);
});

test("non-admin cannot create a native platform user", async () => {
  const exec = buildTestExecutor();

  const forbidden = await exec.asCreator({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "blocked@company.com",
      name: "Blocked",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  assert.equal(forbidden.status, 403);
});

test("native login with temp password issues a session and reports mustChangePassword", async () => {
  const exec = buildTestExecutor();

  await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "login.user@company.com",
      name: "Login User",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  const login = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "login.user@company.com", password: "Temp1234!" }
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.match(login.body.data.token, /^evcp_session\./);
  assert.equal(login.body.data.mustChangePassword, true);
});

test("login with wrong password and login with unknown email return a uniform 401", async () => {
  const exec = buildTestExecutor();

  await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "uniform.user@company.com",
      name: "Uniform User",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  const wrongPassword = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "uniform.user@company.com", password: "wrong-password" }
  });
  const unknownEmail = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "does.not.exist@company.com", password: "whatever" }
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal(wrongPassword.body.error.code, "invalid_credentials");
});

test("change-password with the native session token updates the password and clears mustChangePassword", async () => {
  const exec = buildTestExecutor();

  await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "change.pw@company.com",
      name: "Change Pw",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  const login = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "change.pw@company.com", password: "Temp1234!" }
  });
  const token = login.body.data.token;

  const changed = await exec.withToken(token, {
    method: "POST",
    path: "/auth/change-password",
    body: { currentPassword: "Temp1234!", newPassword: "NewStrongPass1!" }
  });

  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);

  const reLogin = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "change.pw@company.com", password: "NewStrongPass1!" }
  });

  assert.equal(reLogin.status, 200);
  assert.equal(reLogin.body.data.mustChangePassword, false);
});

test("created native user is persisted with the creator role visible via /auth/me", async () => {
  const exec = buildTestExecutor();

  await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "role.check@company.com",
      name: "Role Check",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });

  const login = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "role.check@company.com", password: "Temp1234!" }
  });
  const token = login.body.data.token;

  const me = await exec.withToken(token, { method: "GET", path: "/auth/me" });

  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, "role.check@company.com");
  assert.equal(me.body.data.user.role, "creator");
});

test("login and change-password source from core-persistence even when the in-memory identity does not know the user (post-restart durability)", async () => {
  const services = createNativeAuthServices();

  // Provision a user DIRECTLY into core-persistence + credentials, bypassing the /admin/users
  // route so the in-memory identity dual-write (registerUser) never runs. This reproduces the
  // post-restart condition: the Postgres (core-persistence) row survives while the mock identity
  // seed — reseeded to 3 users every process start — has no knowledge of the user.
  const email = "restart.survivor@company.com";
  const created = await createUserWithRole(services.corePersistenceClient, {
    id: "usr_restart_1",
    email,
    name: "Restart Survivor",
    role: "creator"
  });
  await services.credentialService.setPassword(created.id, "Temp1234!", { mustChange: true });

  // Precondition: the in-memory identity genuinely does NOT know this user.
  assert.throws(() => services.identity.getUserByEmail(email));

  // Login still succeeds, sourcing the session subject from core-persistence.
  const login = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: { email, password: "Temp1234!" }
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.match(login.body.data.token, /^evcp_session\./);
  assert.equal(login.body.data.mustChangePassword, true);
  const token = login.body.data.token;

  // Change-password with the native token also succeeds, resolved via the persistence auth path.
  const changed = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/auth/change-password",
    headers: { authorization: `Bearer ${token}` },
    body: { currentPassword: "Temp1234!", newPassword: "NewStrongPass1!" }
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.ok, true);

  // The identity STILL does not know the user — proving neither path depended on it.
  assert.throws(() => services.identity.getUserByEmail(email));

  // Re-login reflects the flipped mustChangePassword flag read back from core-persistence.
  const reLogin = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/auth/login",
    headers: {},
    body: { email, password: "NewStrongPass1!" }
  });
  assert.equal(reLogin.status, 200);
  assert.equal(reLogin.body.data.mustChangePassword, false);

  // /auth/me resolves the same Postgres-only user with the creator role from the join.
  const me = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/auth/me",
    headers: { authorization: `Bearer ${reLogin.body.data.token}` }
  });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, email);
  assert.equal(me.body.data.user.role, "creator");
});

test("simulate-login is disabled when EVCP_ALLOW_SIMULATE_LOGIN=0", async () => {
  const exec = await buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "0" } });
  const res = await exec.asAdmin({
    method: "POST",
    path: "/admin/auth/simulate-login",
    body: {
      providerId: "authprov_keycloak_default_001",
      subject: "s",
      email: "creator@company.com",
      name: "C",
      groups: ["evcp-creators"]
    }
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "simulate_login_disabled");
});

test("mock header auth is disabled when EVCP_ALLOW_SIMULATE_LOGIN=0", async () => {
  const exec = await buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "0" } });
  const res = await exec.asCreator({ method: "GET", path: "/auth/me" });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
  assert.match(res.body.error.message, /Mock header auth is disabled/);
});
