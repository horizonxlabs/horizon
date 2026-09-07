import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import {
  actor,
  drain,
  memoryWorkspace,
  scriptedGovernedAiExecutor
} from "./helpers/pi-agent-workspace-flow-fixtures.mjs";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const RECAP = "หน้า landing พร้อมแล้ว\n\n![hero tractor](public/generated/hero-tractor.png)";

test("a generate_image turn writes real bytes, commits them, and keeps the recap markdown", async () => {
  const { docker, containerId, files } = await memoryWorkspace();
  const chatHistory = createMemoryChatHistoryStore();
  const actionRunner = createActionRunner({
    docker,
    migrations: createMemoryMigrationStore(),
    checkpoints: createMemoryCheckpointStore()
  });
  const imageRequests = [];
  const governedAiExecutor = Object.assign(
    scriptedGovernedAiExecutor(
      [["generate_image", { path: "public/generated/hero-tractor.png", prompt: "tractor at sunset", aspectRatio: "16:9" }]],
      RECAP
    ),
    {
      async generateImage(_actor, input) {
        imageRequests.push(input);
        return {
          status: "succeeded",
          base64: PNG_B64,
          mimeType: "image/png",
          evidence: { requestId: input.requestId, scenario: "image_generation" }
        };
      }
    }
  );
  const service = createPiGenerationService({
    governedAiExecutor,
    chatHistory,
    actionRunner,
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    getContainerId: () => containerId,
    readContextFiles: async () => [],
    readWorkspaceFiles: async () =>
      [...files]
        .filter(([, content]) => typeof content === "string")
        .map(([path, content]) => ({ path, content })),
    listWorkspaceTree: async () => [...files.keys()],
    workspaceGuard: {
      async prepare() {
        return "base-sha";
      },
      async hasChanges() {
        return true;
      },
      async validate() {},
      async restore() {},
      async restoreSnapshot() {},
      async releaseSnapshot() {}
    },
    async commitAllChanges() {
      return "candidate-sha";
    },
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: []
    })
  });

  const events = await drain(
    service.runTurn({ projectId: "project-flow", prompt: "สร้าง landing page", actor, agentMode: "build" })
  );

  // the image action streamed with its own action type and succeeded
  const start = events.find((event) => event.type === "action_start" && event.actionType === "image");
  assert.ok(start, "expected an image action_start");
  const done = events.find((event) => event.type === "action_result" && event.actionType === "image");
  assert.equal(done.ok, true, done.error);
  // Creator activity names the generated asset so users can connect the action to
  // the workspace bytes and recap markdown asserted below.
  assert.equal(done.label, "public/generated/hero-tractor.png");

  // governed executor received a per-call requestId and the exact prompt
  assert.equal(imageRequests.length, 1);
  assert.equal(imageRequests[0].prompt, "tractor at sunset");
  assert.equal(imageRequests[0].aspectRatio, "16:9");
  assert.match(imageRequests[0].requestId, /^img_/);

  // real bytes landed in the workspace at the exact path
  const written = files.get("public/generated/hero-tractor.png");
  assert.ok(Buffer.isBuffer(written), "asset bytes must be written as binary");
  assert.equal(written.toString("base64"), PNG_B64);

  // the turn committed and the recap (with the thumbnail markdown) is in chat history
  assert.ok(events.some((event) => event.type === "commit"));
  const messages = await chatHistory.listMessages("project-flow");
  const recap = messages.at(-1);
  assert.equal(recap.role, "assistant");
  assert.match(recap.content, /!\[hero tractor\]\(public\/generated\/hero-tractor\.png\)/);
});
