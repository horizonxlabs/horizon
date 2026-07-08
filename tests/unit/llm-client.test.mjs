// tests/unit/llm-client.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryLlmCompletionClient, createLiteLlmCompletionClient } from "../../apps/platform-api/src/generation-loop/llm-client.ts";

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks.join("");
}

test("memory llm client replays scripted replies in order, one per call", async () => {
  const client = createMemoryLlmCompletionClient(["first reply", "second reply"]);
  const first = await collect(client.streamChat({ apiKey: "k", systemPrompt: "sys", messages: [] }));
  const second = await collect(client.streamChat({ apiKey: "k", systemPrompt: "sys", messages: [] }));
  assert.equal(first, "first reply");
  assert.equal(second, "second reply");
});

test("litellm client posts an OpenAI-compatible streamed request and yields delta content", async () => {
  const sseBody =
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
    "data: [DONE]\n\n";

  let capturedRequest;
  const fetchImpl = async (url, init) => {
    capturedRequest = { url, init };
    return {
      ok: true,
      body: {
        async *[Symbol.asyncIterator]() {
          yield new TextEncoder().encode(sseBody);
        }
      }
    };
  };

  const client = createLiteLlmCompletionClient({ baseUrl: "http://litellm:4000", fetchImpl });
  const text = await collect(
    client.streamChat({ apiKey: "sk-project", systemPrompt: "be terse", messages: [{ role: "user", content: "hi" }] })
  );

  assert.equal(text, "Hello");
  assert.equal(capturedRequest.url, "http://litellm:4000/chat/completions");
  const body = JSON.parse(capturedRequest.init.body);
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages[0], { role: "system", content: "be terse" });
  assert.deepEqual(body.messages[1], { role: "user", content: "hi" });
  assert.equal(capturedRequest.init.headers.Authorization, "Bearer sk-project");
});
