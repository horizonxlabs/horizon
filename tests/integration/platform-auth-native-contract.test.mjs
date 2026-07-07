import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTestExecutor } from "./helpers/auth-native-harness.mjs";

test("admin can create a native platform user with a temp password", async () => {
  const exec = buildTestExecutor();

  const created = await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: { email: "new.creator@company.com", name: "New Creator", role: "creator", tempPassword: "Temp1234!" }
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
    body: { email: "blocked@company.com", name: "Blocked", role: "creator", tempPassword: "Temp1234!" }
  });

  assert.equal(forbidden.status, 403);
});

test("native login with temp password issues a session and reports mustChangePassword", async () => {
  const exec = buildTestExecutor();

  await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: { email: "login.user@company.com", name: "Login User", role: "creator", tempPassword: "Temp1234!" }
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
    body: { email: "uniform.user@company.com", name: "Uniform User", role: "creator", tempPassword: "Temp1234!" }
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
    body: { email: "change.pw@company.com", name: "Change Pw", role: "creator", tempPassword: "Temp1234!" }
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
    body: { email: "role.check@company.com", name: "Role Check", role: "creator", tempPassword: "Temp1234!" }
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

test("simulate-login is disabled when EVCP_ALLOW_SIMULATE_LOGIN=0", async () => {
  const exec = await buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "0" } });
  const res = await exec.asAdmin({
    method: "POST",
    path: "/admin/auth/simulate-login",
    body: { providerId: "authprov_keycloak_default_001", subject: "s", email: "creator@company.com", name: "C", groups: ["evcp-creators"] }
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "simulate_login_disabled");
});
