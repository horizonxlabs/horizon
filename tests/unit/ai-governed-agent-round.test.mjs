import assert from "node:assert/strict";
import test from "node:test";

import {
  GovernedAiExecutor,
  MemoryAiExecutionStore
} from "../../apps/platform-api/src/ai-governance/execution-service.ts";

const actor = {
  id: "usr_creator",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};

const primary = {
  id: "aip_primary",
  model: "gpt-test",
  secret: "primary-secret",
  adapter: "openai",
  baseUrl: "https://gateway.example.test/v1"
};

const fallback = {
  id: "aip_fallback",
  model: "gpt-fallback",
  secret: "fallback-secret",
  adapter: "openai",
  baseUrl: "https://fallback.example.test/v1"
};

function roundInput(overrides = {}) {
  return {
    scenario: "frontend_coding",
    projectId: "proj_1",
    requestId: "round-1",
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

function assistantToolCall(provider = primary) {
  return {
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "I will inspect the page." },
        {
          type: "toolCall",
          id: "call-1",
          name: "read_workspace_file",
          arguments: { path: "app/page.tsx" }
        }
      ],
      timestamp: 2
    },
    usage: { input: 11, output: 7, totalTokens: 18, costUsd: 0.002 },
    latencyMs: 9,
    providerId: provider.id,
    model: provider.model
  };
}

test("structured rounds preserve native tool calls and governance evidence", async () => {
  const order = [];
  const events = [];
  const store = {
    findByRequestId: async () => undefined,
    save: async (result) => {
      order.push("save");
      return result;
    },
    listRecent: async () => []
  };
  const executor = new GovernedAiExecutor({
    store,
    resolvePlan: async () => ({ provider: primary }),
    evaluateGuardrail: async ({ prompt }) => {
      order.push("guardrail");
      assert.match(prompt, /Read the current page/);
      return { decision: "allow" };
    },
    reserveQuota: async ({ requestedTokens }) => {
      order.push("quota");
      assert.ok(requestedTokens > 0);
      return { allowed: true, remainingToday: 900, quotaScope: "project:proj_1" };
    },
    reconcileQuota: async ({ actualTokens }) => {
      order.push("reconcile");
      assert.equal(actualTokens, 18);
    },
    invoke: async () => {
      throw new Error("text completion path must not run");
    },
    invokeAgentRound: async ({ provider, messages, tools, onEvent }) => {
      order.push("invoke");
      assert.equal(provider.id, primary.id);
      assert.equal(messages[0].role, "user");
      assert.deepEqual(
        tools.map((tool) => tool.name),
        ["read_workspace_file"]
      );
      onEvent?.({ type: "text_delta", delta: "I will inspect the page." });
      onEvent?.({ type: "toolcall_start", contentIndex: 1 });
      onEvent?.({
        type: "toolcall_end",
        contentIndex: 1,
        toolCall: {
          type: "toolCall",
          id: "call-1",
          name: "read_workspace_file",
          arguments: { path: "app/page.tsx" }
        }
      });
      return assistantToolCall(provider);
    }
  });

  const result = await executor.executeAgentRound(actor, roundInput(), (event) => {
    events.push(event);
  });

  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.message.content.at(-1), {
    type: "toolCall",
    id: "call-1",
    name: "read_workspace_file",
    arguments: { path: "app/page.tsx" }
  });
  assert.equal(result.evidence.requestId, "round-1");
  assert.equal(result.evidence.tokensUsed, 18);
  assert.equal(result.evidence.costUsd, 0.002);
  assert.deepEqual(order, ["guardrail", "quota", "invoke", "reconcile", "save"]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["text_delta", "toolcall_start", "toolcall_end"]
  );
});

test("structured rounds use fallback only when primary fails before streaming", async () => {
  const providers = [];
  const events = [];
  const executor = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => ({ provider: primary, fallback }),
    evaluateGuardrail: async () => ({ decision: "allow" }),
    reserveQuota: async () => ({
      allowed: true,
      remainingToday: 900,
      quotaScope: "project:proj_1"
    }),
    invoke: async () => {
      throw new Error("text completion path must not run");
    },
    invokeAgentRound: async ({ provider, onEvent }) => {
      providers.push(provider.id);
      if (provider.id === primary.id) throw new Error(`upstream rejected ${primary.secret}`);
      onEvent?.({ type: "text_delta", delta: "Recovered" });
      return {
        ...assistantToolCall(provider),
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Recovered" }],
          timestamp: 3
        }
      };
    }
  });

  const result = await executor.executeAgentRound(
    actor,
    roundInput({ requestId: "round-fallback" }),
    (event) => events.push(event)
  );

  assert.equal(result.status, "fallback");
  assert.deepEqual(providers, [primary.id, fallback.id]);
  assert.deepEqual(events, [{ type: "text_delta", delta: "Recovered" }]);
  assert.equal(result.evidence.providerId, fallback.id);
  assert.equal(result.evidence.fallbackUsed, true);
  assert.match(result.evidence.failureReason, /\[redacted-secret\]/);
  assert.doesNotMatch(result.evidence.failureReason, /primary-secret/);
});

test("a primary failure after a streamed delta does not mix in fallback output", async () => {
  const providers = [];
  const events = [];
  const executor = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => ({ provider: primary, fallback }),
    evaluateGuardrail: async () => ({ decision: "allow" }),
    reserveQuota: async () => ({
      allowed: true,
      remainingToday: 900,
      quotaScope: "project:proj_1"
    }),
    invoke: async () => {
      throw new Error("text completion path must not run");
    },
    invokeAgentRound: async ({ provider, onEvent }) => {
      providers.push(provider.id);
      onEvent?.({ type: "text_delta", delta: "partial" });
      throw new Error("stream disconnected");
    }
  });

  const result = await executor.executeAgentRound(
    actor,
    roundInput({ requestId: "round-partial-failure" }),
    (event) => events.push(event)
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(providers, [primary.id]);
  assert.deepEqual(events, [{ type: "text_delta", delta: "partial" }]);
  assert.equal(result.message, undefined);
});

test("blocked or already-aborted rounds never invoke a provider", async () => {
  let calls = 0;
  const blocked = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => ({ provider: primary }),
    evaluateGuardrail: async () => ({ decision: "block", reason: "policy" }),
    reserveQuota: async () => ({ allowed: true, remainingToday: 900 }),
    invoke: async () => {
      throw new Error("text completion path must not run");
    },
    invokeAgentRound: async () => {
      calls += 1;
      return assistantToolCall();
    }
  });
  const blockedResult = await blocked.executeAgentRound(
    actor,
    roundInput({ requestId: "round-blocked" })
  );
  assert.equal(blockedResult.status, "blocked");

  const controller = new AbortController();
  controller.abort();
  const aborted = new GovernedAiExecutor({
    store: new MemoryAiExecutionStore(),
    resolvePlan: async () => ({ provider: primary }),
    evaluateGuardrail: async () => ({ decision: "allow" }),
    reserveQuota: async () => ({ allowed: true, remainingToday: 900 }),
    invoke: async () => {
      throw new Error("text completion path must not run");
    },
    invokeAgentRound: async () => {
      calls += 1;
      return assistantToolCall();
    }
  });
  const abortedResult = await aborted.executeAgentRound(
    actor,
    roundInput({ requestId: "round-aborted", signal: controller.signal })
  );

  assert.equal(abortedResult.status, "failed");
  assert.equal(abortedResult.evidence.failureReason, "aborted");
  assert.equal(calls, 0);
});
