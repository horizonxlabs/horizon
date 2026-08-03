import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("docker/secrets-entrypoint.sh");

test("sh -n accepts secrets-entrypoint.sh", () => {
  const r = spawnSync("sh", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

// Regression: an image-baked *_FILE var (e.g. litellm's SSL_CERT_FILE -> the
// multi-hundred-KB CA bundle) must NOT be inlined into the environment. Inlining
// it pushed a single env value past MAX_ARG_STRLEN and made the next execve fail
// with E2BIG ("Argument list too long"), crash-looping litellm.
test("does not inline *_FILE vars outside /run/secrets (e.g. SSL_CERT_FILE)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sec-entry-"));
  try {
    const caBundle = join(dir, "ca-certificates.crt");
    writeFileSync(caBundle, "CABUNDLE".repeat(32 * 1024)); // ~256 KB, like a real CA bundle
    // `exec /usr/bin/env` so we can read exactly what the shim exported.
    const r = spawnSync("sh", [SCRIPT, "/usr/bin/env"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { PATH: process.env.PATH, SSL_CERT_FILE: caBundle }
    });
    assert.equal(r.status, 0, r.stderr); // exec succeeds (no E2BIG crash)
    assert.doesNotMatch(r.stdout, /^SSL_CERT=/m); // not inlined
    assert.doesNotMatch(r.stdout, /CABUNDLE/); // the big content never entered the env
    // The *_FILE var itself is passed through untouched.
    assert.match(r.stdout, /^SSL_CERT_FILE=/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
