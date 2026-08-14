import assert from "node:assert/strict";
import test from "node:test";

import { MemoryAiExecutionStore } from "../../apps/platform-api/src/ai-governance/execution-service.ts";
import { createPersistedGovernedAiExecutor } from "../../apps/platform-api/src/ai-governance/execution-runtime.ts";
import { MemoryAiSecretStore } from "../../apps/platform-api/src/ai-governance/secret-store.ts";
import { MemoryAiGovernancePersistenceClient } from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";

const actor = {
  id: "usr_creator",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};

function roundInput(overrides = {}) {
  return {
    scenario: "frontend_coding",
    projectId: "proj_1",
    requestId: "round-runtime",
    systemPrompt: "Use only governed tools.",
    messages: [{ role: "user", content: "Read the current page", timestamp: 1 }],
    tools: [
      {
        name: "read_workspace_file",
        description: "Read a workspace file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false
        }
      }
    ],
    ...overrides
  };
}

async function createRuntimeExecutor(adapter, fetcher) {
  const secretStore = new MemoryAiSecretStore();
  await secretStore.write(`key_${adapter}`, `${adapter}-secret`);
  const client = new MemoryAiGovernancePersistenceClient({
    providers: [
      {
        id: `provider_${adapter}`,
        name: adapter,
        adapter,
        baseUrl:
          adapter === "anthropic"
            ? "https://api.anthropic.example.test/v1"
            : "https://gateway.example.test/v1",
        models: [adapter === "anthropic" ? "claude-test" : "gpt-test"],
        status: "active",
        createdAt: new Date("2026-08-14T00:00:00.000Z")
      }
    ],
    apiKeys: [
      {
        id: `key_${adapter}`,
        providerId: `provider_${adapter}`,
        name: "agent key",
        usageMode: "production",
        quotaTokens: 10000,
        fallbackPriority: 0,
        fingerprint: `sha256:${adapter}`,
        maskedValue: "***test",
        secretCiphertext: `memory://ai-provider-keys/key_${adapter}`,
        keyVersion: 1,
        encryptionProvider: "memory-test-only",
        status: "active",
        createdAt: new Date("2026-08-14T00:00:00.000Z")
      }
    ],
    routes: [
      {
        id: `route_${adapter}`,
        scenario: "frontend_coding",
        primaryProviderId: `provider_${adapter}`,
        primaryModel: adapter === "anthropic" ? "claude-test" : "gpt-test",
        createdAt: new Date("2026-08-14T00:00:00.000Z")
      }
    ]
  });
  return createPersistedGovernedAiExecutor(client, {
    fetcher,
    secretStore,
    executionStore: new MemoryAiExecutionStore()
  });
}

test("runtime streams OpenAI-compatible native text, thinking, and tool calls", async () => {
  let request;
  const stream = [
    'data: {"choices":[{"delta":{"content":"Inspecting ","reasoning_content":"Need file"}}]}',
    "",
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-runtime-1","type":"function","function":{"name":"read_workspace_file","arguments":"{\\"path\\":\\"app/"}}]}}]}',
    "",
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"page.tsx\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":13,"completion_tokens":8,"total_tokens":21},"response_cost":0.003}',
    "",
    "data: [DONE]",
    ""
  ].join("\n");
  const executor = await createRuntimeExecutor("openai", async (url, init) => {
    request = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body))
    };
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  });
  const events = [];

  const result = await executor.executeAgentRound(
    actor,
    roundInput({ requestId: "round-runtime-openai" }),
    (event) => events.push(event)
  );

  assert.equal(result.status, "succeeded");
  assert.equal(request.url, "https://gateway.example.test/v1/chat/completions");
  assert.equal(request.headers.get("authorization"), "Bearer openai-secret");
  assert.deepEqual(request.body.messages[0], {
    role: "system",
    content: "Use only governed tools."
  });
  assert.equal(request.body.stream, true);
  assert.equal(request.body.tools[0].function.name, "read_workspace_file");
  assert.deepEqual(result.message.content, [
    { type: "text", text: "Inspecting " },
    { type: "thinking", thinking: "Need file" },
    {
      type: "toolCall",
      id: "call-runtime-1",
      name: "read_workspace_file",
      arguments: { path: "app/page.tsx" }
    }
  ]);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "text_delta",
      "thinking_delta",
      "toolcall_start",
      "toolcall_delta",
      "toolcall_delta",
      "toolcall_end"
    ]
  );
  assert.equal(result.usage.totalTokens, 21);
  assert.equal(result.evidence.costUsd, 0.003);
});

test("runtime streams Anthropic native tool calls into the same contract", async () => {
  let request;
  const stream = [
    'data: {"type":"message_start","message":{"usage":{"input_tokens":9}}}',
    "",
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"Checking"}}',
    "",
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-anthropic-1","name":"read_workspace_file","input":{}}}',
    "",
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"app/page.tsx\\"}"}}',
    "",
    'data: {"type":"content_block_stop","index":1}',
    "",
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":6}}',
    "",
    'data: {"type":"message_stop"}',
    ""
  ].join("\n");
  const executor = await createRuntimeExecutor("anthropic", async (url, init) => {
    request = {
      url: String(url),
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body))
    };
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  });

  const result = await executor.executeAgentRound(
    actor,
    roundInput({ requestId: "round-runtime-anthropic" })
  );

  assert.equal(result.status, "succeeded");
  assert.equal(request.url, "https://api.anthropic.example.test/v1/messages");
  assert.equal(request.headers.get("x-api-key"), "anthropic-secret");
  assert.equal(request.body.system, "Use only governed tools.");
  assert.equal(request.body.tools[0].name, "read_workspace_file");
  assert.deepEqual(result.message.content.at(-1), {
    type: "toolCall",
    id: "call-anthropic-1",
    name: "read_workspace_file",
    arguments: { path: "app/page.tsx" }
  });
  assert.equal(result.usage.totalTokens, 15);
});
