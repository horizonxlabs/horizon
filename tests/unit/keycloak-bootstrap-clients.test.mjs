import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("apps/platform-api/keycloak/bootstrap-clients.sh");

test("sh -n accepts bootstrap-clients.sh", () => {
  const r = spawnSync("sh", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

// The job races keycloak startup (no depends_on in swarm; keycloak takes minutes).
// `config credentials` must retry until keycloak is reachable rather than fail-fast.
test("waits for keycloak: retries config credentials until it succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-bootstrap-"));
  try {
    const counter = join(dir, "cred-attempts");
    writeFileSync(counter, "0");
    // Fake kcadm: `config credentials` fails on the first two attempts, then succeeds.
    // All other subcommands return plausible values so the rest of the script proceeds.
    const kcadm = join(dir, "kcadm.sh");
    writeFileSync(
      kcadm,
      `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "credentials" ]; then
  n=$(cat "${counter}"); n=$((n + 1)); echo "$n" > "${counter}"
  [ "$n" -lt 3 ] && { echo "Failed to send request - keycloak: System error" >&2; exit 1; }
  exit 0
fi
case "$1 $2" in
  "get clients") echo "client-uuid-123" ;;   # -q clientId=... --fields id
  "get clients/client-uuid-123/service-account-user") echo "svc-uuid-456" ;;
  *) : ;;   # update / add-roles / get service-account-user / etc. -> succeed
esac
exit 0
`
    );
    chmodSync(kcadm, 0o755);
    // No-op sleep so the 2 retries don't cost 10s.
    const fakeSleep = join(dir, "sleep");
    writeFileSync(fakeSleep, "#!/bin/sh\nexit 0\n");
    chmodSync(fakeSleep, 0o755);

    const r = spawnSync("sh", [SCRIPT], {
      encoding: "utf8",
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        KCADM: kcadm,
        KEYCLOAK_BOOTSTRAP_MAX_ATTEMPTS: "10",
        KEYCLOAK_INTERNAL_ISSUER_URL: "http://keycloak:8080/auth/realms/evcp",
        KEYCLOAK_REALM: "evcp",
        KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
        KC_BOOTSTRAP_ADMIN_PASSWORD: "pw",
        KEYCLOAK_PLATFORM_CLIENT_ID: "evcp-platform-api",
        KEYCLOAK_PLATFORM_CLIENT_SECRET: "psecret",
        KEYCLOAK_ADMIN_CLIENT_ID: "evcp-admin-service",
        KEYCLOAK_ADMIN_CLIENT_SECRET: "asecret",
        EVCP_PUBLIC_API_URL: "http://34.143.172.71/api",
        EVCP_ADMIN_WEB_URL: "http://34.143.172.71",
        EVCP_CREATOR_WEB_URL: "http://34.143.172.71",
        EVCP_STORE_WEB_URL: "http://34.143.172.71"
      }
    });
    assert.equal(r.status, 0, `stderr:\n${r.stderr}`);
    // Proves it retried through the two failures instead of giving up.
    assert.equal(readFileSync(counter, "utf8").trim(), "3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("gives up with a clear error after max attempts when keycloak never comes up", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-bootstrap-"));
  try {
    const kcadm = join(dir, "kcadm.sh");
    writeFileSync(kcadm, "#!/bin/sh\necho 'System error' >&2\nexit 1\n"); // always fails
    chmodSync(kcadm, 0o755);
    const fakeSleep = join(dir, "sleep");
    writeFileSync(fakeSleep, "#!/bin/sh\nexit 0\n");
    chmodSync(fakeSleep, 0o755);

    const r = spawnSync("sh", [SCRIPT], {
      encoding: "utf8",
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        KCADM: kcadm,
        KEYCLOAK_BOOTSTRAP_MAX_ATTEMPTS: "3",
        KEYCLOAK_INTERNAL_ISSUER_URL: "http://keycloak:8080/auth/realms/evcp",
        KEYCLOAK_REALM: "evcp",
        KC_BOOTSTRAP_ADMIN_USERNAME: "admin",
        KC_BOOTSTRAP_ADMIN_PASSWORD: "pw"
      }
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not reachable .* after 3 attempts; giving up/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
