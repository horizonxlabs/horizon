import assert from "node:assert/strict";
import test from "node:test";

import { createGenerateImageTool } from "../../apps/platform-api/src/generation-loop/pi-image-tool.ts";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function fixture(overrides = {}) {
  const actionRunnerCalls = [];
  const generateCalls = [];
  const context = {
    projectId: "project-1",
    containerId: "container-1",
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    actionRunner: {
      async runAction(input) {
        actionRunnerCalls.push(input);
        return { ok: true, stdout: `wrote ${input.action.filePath}` };
      }
    },
    readWorkspaceFiles: async () => [],
    listWorkspaceTree: async () => ["app/page.tsx", "public/generated/existing.png"],
    skillInstructions: {},
    migrationBuffer: [],
    signal: new AbortController().signal,
    limits: {
      maxToolCalls: 20,
      maxToolInputBytes: 64_000,
      maxToolOutputBytes: 8_192,
      shellTimeoutMs: 30_000,
      maxImageCalls: 2,
      maxImageBytes: 4_194_304
    },
    nextToolCall() {},
    generateImage: async (input) => {
      generateCalls.push(input);
      return { status: "succeeded", base64: PNG_B64, mimeType: "image/png" };
    },
    ...overrides
  };
  const tool = createGenerateImageTool(context);
  const run = (params) => tool.execute("call-img", params, undefined, undefined, {});
  return { tool, run, actionRunnerCalls, generateCalls, context };
}

test("generates an image, writes the asset, and teaches base-path usage in the text result", async () => {
  const { run, actionRunnerCalls, generateCalls } = fixture();
  const result = await run({
    path: "public/generated/hero.png",
    prompt: "tractor in a rice field at sunset",
    aspectRatio: "16:9"
  });
  assert.equal(result.details.ok, true, result.details.error);
  assert.equal(result.details.actionType, "image");
  assert.equal(result.details.label, "public/generated/hero.png");
  assert.equal(result.details.body, "tractor in a rice field at sunset");
  assert.deepEqual(generateCalls, [
    { prompt: "tractor in a rice field at sunset", aspectRatio: "16:9" }
  ]);
  assert.equal(actionRunnerCalls.length, 1);
  assert.equal(actionRunnerCalls[0].action.type, "asset");
  assert.equal(actionRunnerCalls[0].action.filePath, "public/generated/hero.png");
  assert.equal(actionRunnerCalls[0].action.base64, PNG_B64);
  const text = result.content[0].text;
  assert.match(text, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(text, /!\[[^\]]*\]\(public\/generated\/hero\.png\)/);
});

test("rejects bad paths, bad aspect ratios, and overwriting an existing image", async () => {
  const { run, actionRunnerCalls, generateCalls } = fixture();
  for (const path of [
    "app/hero.png",
    "public/hero.png",
    "public/generated/hero.jpg",
    "public/generated/../x.png",
    "public/generated/a/b.png"
  ]) {
    const result = await run({ path, prompt: "p" });
    assert.equal(result.details.ok, false, `expected rejection for ${path}`);
  }
  const ratio = await run({ path: "public/generated/x.png", prompt: "p", aspectRatio: "21:9" });
  assert.equal(ratio.details.ok, false);
  assert.match(ratio.details.error, /aspect/i);
  const existing = await run({ path: "public/generated/existing.png", prompt: "p" });
  assert.equal(existing.details.ok, false);
  assert.match(existing.details.error, /already exists/i);
  assert.equal(generateCalls.length, 0);
  assert.equal(actionRunnerCalls.length, 0);
});

test("per-turn image cap fails the call past the limit with a clear message", async () => {
  let images = 0;
  const { run } = fixture({
    nextImageCall() {
      images += 1;
      if (images > 2) throw new Error("Pi image generation budget exceeded (2 per turn)");
    }
  });
  assert.equal((await run({ path: "public/generated/a.png", prompt: "p" })).details.ok, true);
  assert.equal((await run({ path: "public/generated/b.png", prompt: "p" })).details.ok, true);
  const third = await run({ path: "public/generated/c.png", prompt: "p" });
  assert.equal(third.details.ok, false);
  assert.match(third.details.error, /budget/i);
});

test("fails soft when image generation is not configured or blocked, and enforces the byte cap", async () => {
  const missing = fixture({ generateImage: undefined });
  const notConfigured = await missing.run({ path: "public/generated/x.png", prompt: "p" });
  assert.equal(notConfigured.details.ok, false);
  assert.match(notConfigured.content[0].text, /not configured/i);
  assert.match(notConfigured.content[0].text, /continue/i);
  assert.equal(notConfigured.details.softFailure, true);
  assert.equal(missing.actionRunnerCalls.length, 0);

  const blocked = fixture({
    generateImage: async () => ({ status: "blocked", failureReason: "quota_exceeded" })
  });
  const deniedResult = await blocked.run({ path: "public/generated/x.png", prompt: "p" });
  assert.equal(deniedResult.details.ok, false);
  assert.match(deniedResult.details.error, /quota_exceeded/);
  assert.equal(deniedResult.details.softFailure, true);

  const unavailable = fixture({
    generateImage: async () => {
      throw new Error("AI image provider returned HTTP 403");
    }
  });
  const unavailableResult = await unavailable.run({ path: "public/generated/x.png", prompt: "p" });
  assert.equal(unavailableResult.details.ok, false);
  assert.equal(unavailableResult.details.softFailure, true);
  assert.match(unavailableResult.details.error, /HTTP 403/);
  assert.match(unavailableResult.content[0].text, /continue/i);

  const oversized = fixture({
    limits: {
      maxToolCalls: 20,
      maxToolInputBytes: 64_000,
      maxToolOutputBytes: 8_192,
      shellTimeoutMs: 30_000,
      maxImageCalls: 4,
      maxImageBytes: 16
    }
  });
  const tooBig = await oversized.run({ path: "public/generated/x.png", prompt: "p" });
  assert.equal(tooBig.details.ok, false);
  assert.match(tooBig.details.error, /image size|byte/i);
  assert.equal(oversized.actionRunnerCalls.length, 0);
});

test("rejects provider bytes that are not a real PNG before writing the asset", async () => {
  const wrongMime = fixture({
    generateImage: async () => ({ status: "succeeded", base64: PNG_B64, mimeType: "image/jpeg" })
  });
  const wrongMimeResult = await wrongMime.run({ path: "public/generated/x.png", prompt: "p" });
  assert.equal(wrongMimeResult.details.ok, false);
  assert.match(wrongMimeResult.details.error, /PNG/i);
  assert.equal(wrongMime.actionRunnerCalls.length, 0);

  const badSignature = fixture({
    generateImage: async () => ({
      status: "succeeded",
      base64: Buffer.from("not a png").toString("base64"),
      mimeType: "image/png"
    })
  });
  const badSignatureResult = await badSignature.run({
    path: "public/generated/y.png",
    prompt: "p"
  });
  assert.equal(badSignatureResult.details.ok, false);
  assert.match(badSignatureResult.details.error, /PNG/i);
  assert.equal(badSignature.actionRunnerCalls.length, 0);
});
