import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("real installer CLI dry-run succeeds and writes report for checked-in example contract", () => {
  const reportDir = mkdtempSync(join(tmpdir(), "evcp-installer-cli-"));
  try {
    const result = spawnSync(
      "node",
      [
        "scripts/install/installer.mjs",
        "--env",
        ".env.example",
        "--compose",
        "docker/docker-compose.yml",
        "--report-dir",
        reportDir,
        "--allow-example-secrets",
        "--text"
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /EVCP installer: PASSED/);
    assert.match(result.stdout, /PASSED preflight/);
    assert.match(result.stdout, /PASSED verify_health/);

    const reportPath = result.stdout.match(/report: (.+)/)?.[1]?.trim();
    assert.ok(reportPath);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.status, "passed");
    assert.equal(report.mode, "dry-run");
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
});

test("real installer CLI fails dry-run when example secrets are not explicitly allowed", () => {
  const reportDir = mkdtempSync(join(tmpdir(), "evcp-installer-cli-fail-"));
  try {
    const result = spawnSync(
      "node",
      [
        "scripts/install/installer.mjs",
        "--env",
        ".env.example",
        "--compose",
        "docker/docker-compose.yml",
        "--report-dir",
        reportDir,
        "--text"
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /EVCP installer: FAILED/);
    assert.match(result.stdout, /FAILED preflight/);
    assert.match(result.stdout, /action: secret:AI_API_KEY/);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
});
