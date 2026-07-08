import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";

test("commits real changes inside a throwaway container and returns a sha", { skip: !LIVE }, async () => {
  // boot a throwaway workspace container
  const cid = execFileSync("docker", ["run", "-d", "--rm", "evcp/workspace-next:1", "sh", "-c", "sleep 300"]).toString().trim();
  try {
    const committer = createContainerGitCommitter(createDockerSocketEngine());
    const sha1 = await committer.commit(cid, "AI: initial");
    assert.match(sha1, /^[0-9a-f]{7,40}$/, "expected a git sha");

    // write a file then commit again — new sha
    execFileSync("docker", ["exec", cid, "sh", "-c", "echo hello > /workspace/app/generated.txt"]);
    const sha2 = await committer.commit(cid, "AI: add generated.txt");
    assert.match(sha2, /^[0-9a-f]{7,40}$/);
    assert.notEqual(sha1, sha2, "a new commit should have a different sha");
  } finally {
    execFileSync("docker", ["rm", "-f", cid]);
  }
});
