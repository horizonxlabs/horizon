import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { restoreWorkspaceCommit } = await import(
  "../../apps/platform-api/src/generation-loop/workspace-restore.ts"
);
const { createGovernedContextResolver } = await import(
  "../../apps/platform-api/src/generation-loop/governed-context.ts"
);
const { summarizeActions } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-actions.ts"
);

function buildPrompt() {
  return buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
}

test("build turns must close with a detailed recap — chat history is the project log", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /project log|project's memory/i);
  assert.match(prompt, /recap/i);
  assert.doesNotMatch(prompt, /ONE short sentence/);
});

test("governed context no longer injects the PRD spec into the loop", async () => {
  const resolver = createGovernedContextResolver({
    skills: { resolve() { throw new Error("none"); } },
    knowledge: { retrieve() { throw new Error("none"); } },
    prds: {
      listVersions: () => [{ isBaseline: true }],
      getCurrent: () => ({ sections: [{ title: "x", body: "y" }] })
    }
  });
  const context = await resolver({ actor: { id: "u1" }, projectId: "prj_1", scenario: "frontend_coding" });
  assert.equal(context.productSpec, undefined);
});

test("workspace restore validates the sha, serializes on the turn lock, and logs to chat", async () => {
  const calls = [];
  const deps = {
    lock: {
      async acquire(projectId) {
        calls.push(["lock", projectId]);
        return () => calls.push(["release", projectId]);
      }
    },
    guard: { async restore(projectId, sha) { calls.push(["restore", projectId, sha]); } },
    chatHistory: { async appendMessage(message) { calls.push(["chat", message.role]); } }
  };
  await restoreWorkspaceCommit(deps, "prj_1", "abc123def456");
  assert.deepEqual(calls, [
    ["lock", "prj_1"],
    ["restore", "prj_1", "abc123def456"],
    ["chat", "assistant"],
    ["release", "prj_1"]
  ]);
  await assert.rejects(() => restoreWorkspaceCommit(deps, "prj_1", "not a sha!"), /commit/i);
});

test("summarizeActions rolls the detail rows into one human line", () => {
  const summary = summarizeActions([
    { id: "a", type: "file", label: "app/page.tsx", status: "done", body: "a\nb" },
    { id: "b", type: "edit", label: "app/page.tsx", status: "done", replace: "x" },
    { id: "c", type: "shell", label: "npm run x", status: "failed" },
    { id: "d", type: "file", label: "components/X.tsx", status: "running", body: "1\n2\n3" }
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.done, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.running, 1);
  assert.equal(summary.lines, 6);
});
