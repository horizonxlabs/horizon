import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTestExecutor } from "./helpers/auth-native-harness.mjs";

test("production configuration rejects native credentials, mock headers, and simulated login", async () => {
  const exec = buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "0" } });

  const [login, changePassword, mockHeader, simulatedLogin] = await Promise.all([
    exec.anon({
      method: "POST",
      path: "/auth/login",
      body: { email: "admin@company.com", password: "irrelevant" }
    }),
    exec.asCreator({
      method: "POST",
      path: "/auth/change-password",
      body: { currentPassword: "irrelevant", newPassword: "NewStrongPass1!" }
    }),
    exec.asCreator({ method: "GET", path: "/auth/me" }),
    exec.asAdmin({
      method: "POST",
      path: "/admin/auth/simulate-login",
      body: {
        providerId: "authprov_keycloak_default_001",
        subject: "simulated-user",
        email: "creator@company.com",
        name: "Creator",
        groups: ["evcp-creators"]
      }
    })
  ]);

  assert.equal(login.status, 401);
  assert.equal(login.body.error.code, "invalid_credentials");
  assert.equal(changePassword.status, 401);
  assert.equal(changePassword.body.error.code, "UNAUTHORIZED");
  assert.equal(mockHeader.status, 401);
  assert.equal(mockHeader.body.error.code, "UNAUTHORIZED");
  assert.equal(simulatedLogin.status, 403);
  assert.equal(simulatedLogin.body.error.code, "simulate_login_disabled");
});

test("native credential harness is available only when explicitly enabled for isolated tests", async () => {
  const exec = buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "1" } });

  const created = await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: {
      email: "native.harness@company.com",
      name: "Native Harness",
      role: "creator",
      tempPassword: "Temp1234!"
    }
  });
  assert.equal(created.status, 201);

  const login = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "native.harness@company.com", password: "Temp1234!" }
  });
  assert.equal(login.status, 200);
  assert.match(login.body.data.token, /^evcp_session\./);
});
