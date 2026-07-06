// apps/platform-api/src/generation-loop/llm-client.ts

export interface ChatCompletionInput {
  apiKey: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LlmCompletionClient {
  streamChat(input: ChatCompletionInput): AsyncIterable<string>;
}

export function createMemoryLlmCompletionClient(scriptedReplies: string[]): LlmCompletionClient {
  let index = 0;
  return {
    streamChat() {
      const reply = scriptedReplies[index] ?? "";
      index += 1;
      return (async function* () {
        yield reply;
      })();
    },
  };
}

export function createLiteLlmCompletionClient(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): LlmCompletionClient {
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    async *streamChat(input) {
      const response = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: "default",
          stream: true,
          messages: [{ role: "system", content: input.systemPrompt }, ...input.messages],
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`litellm completion request failed (${response.status})`);
      }

      let buffer = "";
      for await (const rawChunk of response.body as AsyncIterable<Uint8Array>) {
        buffer += new TextDecoder().decode(rawChunk);
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, "").trim();
          if (!payload || payload === "[DONE]") continue;
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield delta;
          }
        }
      }
    },
  };
}
