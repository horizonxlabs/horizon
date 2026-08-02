import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateFileBackedSecrets } from "../../apps/platform-api/src/config/file-backed-secrets.ts";

test("hydrates a var from its _FILE, trimmed", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "pg"), "s3cret\n");
  const env = { POSTGRES_PASSWORD_FILE: join(dir, "pg") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.POSTGRES_PASSWORD, "s3cret");
});

test("does not overwrite an already-set var", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "pg"), "fromfile");
  const env = { POSTGRES_PASSWORD: "preset", POSTGRES_PASSWORD_FILE: join(dir, "pg") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.POSTGRES_PASSWORD, "preset");
});

test("ignores a var whose _FILE is unset or missing", () => {
  const env = { SESSION_SECRET_FILE: "/no/such/file" };
  hydrateFileBackedSecrets(env);
  assert.equal(env.SESSION_SECRET, undefined);
});

test("only hydrates allowlisted vars", () => {
  const dir = mkdtempSync(join(tmpdir(), "fbs-"));
  writeFileSync(join(dir, "x"), "v");
  const env = { NOT_ALLOWED_FILE: join(dir, "x") };
  hydrateFileBackedSecrets(env);
  assert.equal(env.NOT_ALLOWED, undefined);
});
