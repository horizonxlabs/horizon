import assert from "node:assert/strict";
import test from "node:test";

import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import { resolvePiAgentLimits } from "../../apps/platform-api/src/generation-loop/pi-limits.ts";
import {
  actor,
  baseDeps,
  drain
} from "./helpers/pi-generation-service-streaming-lifecycle-fixtures.mjs";

test("default Pi rounds allow the full serial tool budget to finish and commit", async () => {
  const previousRounds = process.env.EVCP_PI_MAX_MODEL_ROUNDS;
  const previousTools = process.env.EVCP_PI_MAX_TOOL_CALLS;
  delete process.env.EVCP_PI_MAX_MODEL_ROUNDS;
  delete process.env.EVCP_PI_MAX_TOOL_CALLS;
  try {
    const limits = resolvePiAgentLimits();
    const lifecycle = [];
    const files = new Map();
    let rounds = 0;
    const executor = {
      async executeAgentRound(_actor, input) {
        rounds += 1;
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content:
              rounds <= limits.maxToolCalls
                ? [
                    {
                      type: "toolCall",
                      id: `write-${rounds}`,
                      name: "write_workspace_file",
                      arguments: {
                        path: `components/part-${rounds}.tsx`,
                        content: `export default function Part() { return <div>Part ${rounds}</div>; }`
                      }
                    }
                  ]
                : [{ type: "text", text: "The requested components are complete." }],
            timestamp: rounds
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    };
    const deps = baseDeps(executor, lifecycle, true);
    deps.limits = limits;
    deps.readWorkspaceFiles = async () => [...files].map(([path, content]) => ({ path, content }));
    deps.actionRunner.runAction = async ({ action }) => {
      files.set(action.filePath, action.content);
      return { ok: true, stdout: "" };
    };
    const service = createPiGenerationService(deps);
    const events = await drain(
      service.runTurn({
        projectId: "p1",
        prompt: "Create the requested components",
        agentMode: "build",
        actor
      })
    );

    assert.deepEqual(
      events.filter((event) => event.type === "error"),
      []
    );
    assert.equal(rounds, limits.maxToolCalls + 1);
    assert.equal(files.size, limits.maxToolCalls);
    assert.ok(lifecycle.includes("validate"));
    assert.ok(events.some((event) => event.type === "commit"));
    assert.equal(
      lifecycle.some((entry) => entry.startsWith("restore:")),
      false
    );
  } finally {
    if (previousRounds === undefined) delete process.env.EVCP_PI_MAX_MODEL_ROUNDS;
    else process.env.EVCP_PI_MAX_MODEL_ROUNDS = previousRounds;
    if (previousTools === undefined) delete process.env.EVCP_PI_MAX_TOOL_CALLS;
    else process.env.EVCP_PI_MAX_TOOL_CALLS = previousTools;
  }
});
