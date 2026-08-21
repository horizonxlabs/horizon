import assert from "node:assert/strict";
import test from "node:test";

const { invokeImageWithCircuitBreaker } = await import(
  "../../apps/platform-api/src/ai-governance/image-provider-runtime.ts"
);

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const googleProvider = {
  id: "aip_google_image",
  model: "gemini-2.5-flash-image",
  secret: "gemini-key",
  adapter: "google",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta"
};

function googleFetch(recorder, body) {
  return async (url, init) => {
    recorder.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () =>
        body ?? {
          candidates: [
            { content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_B64 } }] } }
          ],
          usageMetadata: { totalTokenCount: 1290 }
        }
    };
  };
}

test("google adapter posts generateContent with key header, IMAGE modality, and parses inlineData", async () => {
  const calls = [];
  const result = await invokeImageWithCircuitBreaker(
    googleProvider,
    { prompt: "a red tractor in a rice field", aspectRatio: "16:9" },
    googleFetch(calls),
    5_000,
    new Map()
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
  );
  assert.equal(calls[0].init.headers["x-goog-api-key"], "gemini-key");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.contents[0].parts[0].text, "a red tractor in a rice field");
  assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
  assert.equal(body.generationConfig.imageConfig.aspectRatio, "16:9");
  assert.equal(result.base64, PNG_B64);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.tokensUsed, 1290);
  assert.equal(result.providerId, "aip_google_image");
  assert.ok(result.latencyMs >= 0);
});

test("google adapter omits imageConfig without aspectRatio and rejects a response with no image part", async () => {
  const calls = [];
  await invokeImageWithCircuitBreaker(googleProvider, { prompt: "p" }, googleFetch(calls), 5_000, new Map());
  assert.equal("imageConfig" in JSON.parse(calls[0].init.body).generationConfig, false);

  await assert.rejects(
    () =>
      invokeImageWithCircuitBreaker(
        googleProvider,
        { prompt: "p" },
        googleFetch([], { candidates: [{ content: { parts: [{ text: "no image, sorry" }] } }] }),
        5_000,
        new Map()
      ),
    /no image/i
  );
});

test("openai adapter branch posts /images/generations with b64_json", async () => {
  const calls = [];
  const provider = { id: "aip_oai", model: "gpt-image-1", secret: "sk-img", adapter: "openai", baseUrl: "https://api.openai.com/v1" };
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG_B64 }] }) };
  };
  const result = await invokeImageWithCircuitBreaker(provider, { prompt: "p" }, fetcher, 5_000, new Map());
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/generations");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk-img");
  assert.equal(JSON.parse(calls[0].init.body).response_format, "b64_json");
  assert.equal(result.base64, PNG_B64);
  assert.equal(result.mimeType, "image/png");
});

test("unsupported adapter throws and circuit opens after three failures", async () => {
  await assert.rejects(
    () =>
      invokeImageWithCircuitBreaker(
        { ...googleProvider, adapter: "anthropic" },
        { prompt: "p" },
        googleFetch([]),
        5_000,
        new Map()
      ),
    /not supported/i
  );

  const circuit = new Map();
  const failing = async () => ({ ok: false, status: 500, json: async () => ({}) });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(() =>
      invokeImageWithCircuitBreaker(googleProvider, { prompt: "p" }, failing, 5_000, circuit)
    );
  }
  await assert.rejects(
    () => invokeImageWithCircuitBreaker(googleProvider, { prompt: "p" }, googleFetch([]), 5_000, circuit),
    /circuit is open/i
  );
});
