import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("install preflight CLI verifies the checked-in example contract", () => {
  const output = execFileSync(
    "node",
    [
      "scripts/install/preflight.mjs",
      "--env",
      ".env.example",
      "--compose",
      "docker/docker-compose.yml",
      "--allow-example-secrets"
    ],
    {
      encoding: "utf8"
    }
  );
  const report = JSON.parse(output);
  assert.equal(report.passed, true);
  assert.equal(report.mode, "contract");
  assert.ok(report.composeServices.includes("platform-api"));
  assert.ok(!output.includes("example-ai-api-key-change-before-use"));
});

test("docker compose config accepts the checked-in private-server contract when Docker CLI is available", (context) => {
  try {
    execFileSync("docker", ["--version"], { encoding: "utf8" });
  } catch {
    context.skip("Docker CLI is not available in this environment");
    return;
  }

  assert.doesNotThrow(() => {
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.example",
        "-f",
        "docker/docker-compose.yml",
        "config",
        "--quiet"
      ],
      {
        encoding: "utf8"
      }
    );
  });
});
