import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";
const IMAGE = process.env.EVCP_WORKSPACE_IMAGE ?? "evcp/workspace-next:1";

test(
  "rolling back a failed turn preserves the running Next preview and API routes",
  {
    skip: !LIVE,
    timeout: 180_000
  },
  async () => {
    const cid = execFileSync("docker", [
      "run",
      "-d",
      "--rm",
      "-e",
      "EVCP_PREVIEW_BASE=/preview/rollback-repro",
      "-p",
      "127.0.0.1::3000",
      IMAGE
    ])
      .toString()
      .trim();
    try {
      const ports = JSON.parse(
        execFileSync("docker", [
          "inspect",
          "--format",
          "{{json .NetworkSettings.Ports}}",
          cid
        ]).toString()
      );
      const base = `http://127.0.0.1:${ports["3000/tcp"][0].HostPort}/preview/rollback-repro`;
      const get = (path) => fetch(base + path, { signal: AbortSignal.timeout(30_000) });
      let ready;
      for (let attempt = 0; attempt < 60; attempt++) {
        ready = await get("/api/health").catch(() => undefined);
        if (ready?.ok) break;
        await delay(250);
      }
      assert.equal(ready?.status, 200, "workspace health must start successfully");
      assert.equal((await get("")).status, 200, "preview must work before rollback");
      const committer = createContainerGitCommitter(createDockerSocketEngine());
      const token = await committer.prepare(cid);
      execFileSync("docker", [
        "exec",
        cid,
        "su",
        "-s",
        "/bin/sh",
        "evcp",
        "-c",
        "printf temporary > /workspace/app/failed-turn.txt"
      ]);
      await committer.restoreSnapshot(cid, token);
      await committer.releaseSnapshot(cid, token);
      await delay(1500);
      const page = await get("");
      const health = await get("/api/health");
      console.log({ previewAfterRollback: page.status, apiAfterRollback: health.status });
      assert.equal(page.status, 200, "rollback must not leave the preview returning 404");
      assert.equal(health.status, 200, "rollback must not leave existing API routes returning 404");
      execFileSync("docker", ["exec", cid, "test", "!", "-e", "/workspace/app/failed-turn.txt"]);
    } finally {
      execFileSync("docker", ["rm", "-f", cid], { stdio: "pipe" });
    }
  }
);
