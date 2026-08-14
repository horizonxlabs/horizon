import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createHorizonPiRuntime } from "../../apps/platform-api/src/generation-loop/pi-provider.ts";
import { createHorizonPiSession } from "../../apps/platform-api/src/generation-loop/pi-session-context.ts";
import {
  buildPlanSystemPrompt,
  buildSystemPrompt
} from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const actor = { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" };
const template = { name: "Web App", lockedFiles: ["package.json"], files: [] };
const toolNames = [
  "read_workspace_file",
  "list_workspace_files",
  "load_governed_skill",
  "write_workspace_file",
  "edit_workspace_file",
  "run_workspace_command",
  "queue_database_migration"
];

function customTool(name) {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return { content: [{ type: "text", text: "ok" }], details: {} };
    }
  };
}

async function runtime() {
  return createHorizonPiRuntime({
    executor: {
      executeAgentRound: async () => {
        throw new Error("not invoked");
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-session",
    maxModelRounds: 4
  });
}

async function hostileFixture() {
  const root = await mkdtemp(join(tmpdir(), "horizon-pi-hostile-"));
  await mkdir(join(root, ".pi/extensions"), { recursive: true });
  await mkdir(join(root, ".pi/skills/evil"), { recursive: true });
  await mkdir(join(root, ".pi/prompts"), { recursive: true });
  await writeFile(join(root, ".pi/extensions/evil.ts"), "// evil extension");
  await writeFile(join(root, ".pi/skills/evil/SKILL.md"), "# evil skill");
  await writeFile(join(root, ".pi/prompts/evil.md"), "evil prompt");
  await writeFile(join(root, "AGENTS.md"), "evil extension");
  await writeFile(join(root, "CLAUDE.md"), "evil extension");
  return root;
}

test("Plan session discovers nothing and hydrates only prior Prisma chat", async () => {
  const { modelRuntime, model } = await runtime();
  const fixturePath = await hostileFixture();
  const systemPrompt = buildPlanSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: "Confirmed PRD baseline"
  });
  const session = await createHorizonPiSession({
    modelRuntime,
    model,
    turnId: "turn-plan",
    mode: "plan",
    systemPrompt,
    customTools: toolNames.map(customTool),
    currentMessageId: "msg-current",
    messages: [
      {
        id: "msg-user",
        projectId: "p1",
        role: "user",
        content: "Plan a dashboard",
        artifactActionIds: [],
        commitSha: null,
        tokenUsage: null,
        createdAt: "2026-08-14T00:00:00.000Z"
      },
      {
        id: "msg-assistant",
        projectId: "p1",
        role: "assistant",
        content: "I will plan it.",
        artifactActionIds: [],
        commitSha: null,
        tokenUsage: null,
        createdAt: "2026-08-14T00:00:01.000Z"
      },
      {
        id: "msg-current",
        projectId: "p1",
        role: "user",
        content: `Current message, hostile fixture is ${fixturePath}`,
        artifactActionIds: [],
        commitSha: null,
        tokenUsage: null,
        createdAt: "2026-08-14T00:00:02.000Z"
      }
    ]
  });

  assert.deepEqual(session.resourceLoader.getExtensions().extensions, []);
  assert.deepEqual(session.resourceLoader.getSkills().skills, []);
  assert.deepEqual(session.resourceLoader.getPrompts().prompts, []);
  assert.deepEqual(session.resourceLoader.getAgentsFiles().agentsFiles, []);
  assert.equal(session.sessionFile, undefined);
  assert.deepEqual(session.getActiveToolNames(), toolNames.slice(0, 3));
  assert.match(session.systemPrompt, /Confirmed PRD baseline/);
  assert.doesNotMatch(session.systemPrompt, /evil extension|CLAUDE\.md/);
  assert.deepEqual(
    session.messages.map((message) => message.role),
    ["user", "assistant"]
  );
});

test("Build session enables seven Horizon tools and approved plan context", async () => {
  const { modelRuntime, model } = await runtime();
  const systemPrompt = buildSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: null,
    productSpec: "Confirmed PRD baseline",
    approvedPlan: "Step 1: add a sales dashboard."
  });
  const session = await createHorizonPiSession({
    modelRuntime,
    model,
    turnId: "turn-build",
    mode: "build",
    systemPrompt,
    customTools: toolNames.map(customTool),
    messages: []
  });

  assert.deepEqual(session.getActiveToolNames(), toolNames);
  assert.match(session.systemPrompt, /Step 1: add a sales dashboard/);
  assert.doesNotMatch(session.systemPrompt, /<artifact>|<action/);
});
