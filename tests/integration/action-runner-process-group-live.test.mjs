import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_GIT_LIVE === "1";
const IMAGE = process.env.EVCP_WORKSPACE_IMAGE ?? "evcp/workspace-next:1";
const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

function dockerExec(cid, script) {
  return execFileSync("docker", ["exec", cid, "sh", "-c", script]).toString().trim();
}

function setTestScript(cid, script) {
  execFileSync("docker", [
    "exec",
    cid,
    "node",
    "-e",
    "const fs=require('fs');const p=JSON.parse(fs.readFileSync('/workspace/package.json','utf8'));p.scripts.test=process.argv[1];fs.writeFileSync('/workspace/package.json',JSON.stringify(p));",
    script
  ]);
}

test(
  "package action process groups are gone before normal, abort, and timeout results return",
  { skip: !LIVE },
  async () => {
    const cid = execFileSync("docker", ["run", "-d", "--rm", IMAGE]).toString().trim();
    try {
      dockerExec(
        cid,
        "i=0; until [ -f /workspace/package.json ]; do i=$((i+1)); [ $i -lt 50 ] || exit 1; sleep .1; done"
      );
      const runner = createActionRunner({
        docker: createDockerSocketEngine(),
        checkpoints: createMemoryCheckpointStore(),
        migrations: createMemoryMigrationStore()
      });

      for (const boundary of ["normal", "abort", "timeout"]) {
        const lateFile = `/workspace/app/${boundary}-late.txt`;
        const keepLeaderAlive = boundary === "normal" ? "" : "; sleep 10";
        setTestScript(
          cid,
          `sh -c '(trap "" TERM; sleep 4; printf late > ${lateFile}) & printf started${keepLeaderAlive}'`
        );
        const controller = new AbortController();
        const resultPromise = runner.runAction({
          containerId: cid,
          projectId: "p1",
          template,
          action: { id: `action-${boundary}`, type: "shell", command: "npm", args: ["test"] },
          signal: boundary === "abort" ? controller.signal : undefined,
          timeoutMs: boundary === "normal" ? 10_000 : boundary === "abort" ? 5_000 : 500
        });
        if (boundary === "abort") {
          await new Promise((resolve) => setTimeout(resolve, 200));
          dockerExec(
            cid,
            "find /var/lib/evcp-action-processes -type f -name '*.pgid' -print -quit | grep -q ."
          );
          controller.abort();
        }
        const result = await resultPromise;
        if (boundary === "normal") {
          assert.equal(result.ok, true, JSON.stringify(result));
        } else {
          assert.equal(result.ok, false);
          assert.match(
            result.error,
            new RegExp(boundary === "abort" ? "aborted" : "timed out", "i")
          );
        }
        dockerExec(
          cid,
          `test ! -e ${lateFile}; test -z "$(find /var/lib/evcp-action-processes -type f -name '*.pgid' -print -quit)"`
        );
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        dockerExec(cid, `test ! -e ${lateFile}`);
      }
    } finally {
      execFileSync("docker", ["rm", "-f", cid]);
    }
  }
);
