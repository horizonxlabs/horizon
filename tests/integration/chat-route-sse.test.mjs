import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";
import { createGenerationService } from "../../apps/platform-api/src/generation-loop/generation-service.ts";
import { createMemoryLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createErrorFeedbackTracker } from "../../apps/platform-api/src/generation-loop/error-feedback.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

async function setup(resolveAuth) {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer({
    name: "evcp-ws-demo",
    image: "img",
    env: [],
    hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false
  });

  const scriptedReply =
    'Sure thing.\n<artifact id="a1" title="add page">' +
    '<action type="file" filePath="app/page.tsx">export default function Home(){}</action>' +
    "</artifact>";

  const generationService = createGenerationService({
    llmClient: createMemoryLlmCompletionClient([scriptedReply]),
    chatHistory: createMemoryChatHistoryStore(),
    actionRunner: createActionRunner({
      docker,
      checkpoints: createMemoryCheckpointStore(),
      migrations: createMemoryMigrationStore()
    }),
    errorFeedback: createErrorFeedbackTracker(),
    template,
    getApiKey: () => "sk-fake",
    getContainerId: () => containerId,
    commitAllChanges: async () => "commit-sha-1"
  });

  const handler = createChatSseHandler({
    generationService,
    resolveAuth
  });

  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { server, port };
}

async function postChat(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("POST /projects/:projectId/chat streams SSE events for an authorized member", async () => {
  const { server, port } = await setup(() => ({ userId: "u1", roles: ["member"], projectIds: ["p1"] }));

  try {
    const raw = await postChat(port, "/projects/p1/chat", { prompt: "add home page" });

    assert.equal(raw.statusCode, 200);
    assert.match(raw.headers["content-type"], /text\/event-stream/);
    assert.match(raw.body, /event: token/);
    assert.match(raw.body, /event: action_result/);
    assert.match(raw.body, /event: commit/);
    assert.match(raw.body, /event: done/);
  } finally {
    server.close();
  }
});

test("POST /projects/:projectId/chat returns 403 when caller is not a member of the project", async () => {
  const { server, port } = await setup(() => ({ userId: "u1", roles: ["member"], projectIds: ["p1"] }));

  try {
    const raw = await postChat(port, "/projects/p2/chat", { prompt: "add home page" });

    assert.equal(raw.statusCode, 403);
  } finally {
    server.close();
  }
});

test("POST /projects/:projectId/chat returns 401 when there is no session", async () => {
  const { server, port } = await setup(() => null);

  try {
    const raw = await postChat(port, "/projects/p1/chat", { prompt: "add home page" });

    assert.equal(raw.statusCode, 401);
  } finally {
    server.close();
  }
});
