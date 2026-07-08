import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_DOCKER_LIVE === "1";

test("execInContainer captures real stdout from a throwaway container", { skip: !LIVE }, async () => {
  const cid = execFileSync("docker", ["run", "-d", "--rm", "evcp/workspace-next:1", "sh", "-c", "sleep 120"]).toString().trim();
  try {
    const engine = createDockerSocketEngine();
    const result = await engine.execInContainer(cid, ["sh", "-c", "echo STDOUT_MARKER_123"]);
    assert.ok(result.stdout.includes("STDOUT_MARKER_123"), `expected stdout to include marker, got: ${JSON.stringify(result.stdout)}`);
    assert.equal(result.exitCode, 0);
  } finally {
    execFileSync("docker", ["rm", "-f", cid]);
  }
});
