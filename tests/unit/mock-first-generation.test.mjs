import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { loadGoldenTemplate } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

function buildPrompt() {
  return buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
}

test("prompt makes mock data the default and defers the real database to an explicit sync", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /## Data — mock first/);
  // before sync: no migrations, no pg
  assert.match(prompt, /do NOT emit migration actions/i);
  assert.match(prompt, /lib\/mock-data/);
  // sync path: schema derives from the mock shapes the app already proved out
  assert.match(prompt, /sync/i);
  assert.match(prompt, /derive .*from the mock/i);
  // the real-database mechanics stay documented for the post-sync phase
  assert.match(prompt, /<action type="migration"/);
  assert.match(prompt, /DATABASE_URL/);
});

test("prompt demands believable seed data as part of the design bar", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /seed/i);
  assert.match(prompt, /realistic/i);
});

test("template ships the mock data store and keeps it editable", () => {
  const template = loadGoldenTemplate();
  const mock = template.files.find((file) => file.path === "lib/mock-data.ts");
  assert.ok(mock, "missing lib/mock-data.ts");
  assert.match(mock.content, /createStore/);
  // persists across reloads so the mock phase feels like a real app
  assert.match(mock.content, /localStorage/);
  assert.ok(!template.lockedFiles.includes("lib/mock-data.ts"), "mock layer must stay editable");
});
