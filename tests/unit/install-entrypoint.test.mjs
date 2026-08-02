import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("install.sh");

// Minimal docker stub so preflight + bootstrap --dry-run run without a daemon.
const DOCKER_MOCK = `#!/bin/sh
[ "$1" = "version" ] && { echo "27.0.0"; exit 0; }
[ "$1" = "info" ] && { echo "active"; exit 0; }
[ "$1" = "secret" ] && [ "$2" = "inspect" ] && exit 1
exit 0
`;

function withMock(fn) {
  const dir = mkdtempSync(join(tmpdir(), "install-mock-"));
  writeFileSync(join(dir, "docker"), DOCKER_MOCK);
  chmodSync(join(dir, "docker"), 0o755);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(args, env, mockDir) {
  return spawnSync("sh", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${mockDir}:${process.env.PATH}`, ...env }
  });
}

test("sh -n accepts install.sh", () => {
  const r = spawnSync("sh", ["-n", SCRIPT], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("--dry-run --yes forwards to bootstrap and emits its dry-run JSON, no root/daemon needed", () => {
  const r = withMock((m) => run(["--dry-run", "--yes"], {
    EVCP_IMAGE_REPOSITORY: "ghcr.io/example/evcp",
    EVCP_VERSION: "v9.9.9",
    EVCP_ADVERTISE_ADDR: "10.0.0.5"
  }, m));
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);            // stdout is ONLY the bootstrap dry-run JSON
  assert.equal(plan.mode, "dry-run");
  assert.ok(Array.isArray(plan.secrets) && plan.secrets.length >= 11);
});

test("--yes never emits a secret value and never prompts", () => {
  const r = withMock((m) => run(["--dry-run", "--yes"], {
    EVCP_IMAGE_REPOSITORY: "ghcr.io/example/evcp",
    EVCP_VERSION: "v9.9.9",
    EVCP_ADVERTISE_ADDR: "10.0.0.5"
  }, m));
  assert.doesNotMatch(r.stdout + r.stderr, /postgresql:\/\/evcp:[0-9a-f]{2,}/);
  assert.doesNotMatch(r.stderr, /\?\s*$/);      // no dangling prompt
});

test("resolves image-repository and version defaults from git when unset", () => {
  const r = withMock((m) => run(["--dry-run", "--yes"], { EVCP_ADVERTISE_ADDR: "10.0.0.5" }, m));
  assert.equal(r.status, 0, r.stderr);
  // The summary (stderr) shows a ghcr.io/<org> repo and a v* version derived from the repo.
  assert.match(r.stderr, /image repository\s*:\s*ghcr\.io\/\S+/i);
  assert.match(r.stderr, /version\s*:\s*v\S+/i);
});

test("accepts both --version=X and --version X (space form, as --help documents)", () => {
  for (const args of [
    ["--dry-run", "--yes", "--version=v1.2.3", "--image-repository=ghcr.io/example/evcp"],
    ["--dry-run", "--yes", "--version", "v1.2.3", "--image-repository", "ghcr.io/example/evcp"]
  ]) {
    const r = withMock((m) => run(args, { EVCP_ADVERTISE_ADDR: "10.0.0.5" }, m));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).mode, "dry-run");
    assert.match(r.stderr, /version\s*:\s*v1\.2\.3/i);
  }
});
