import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { extractSuggestions, stripSuggestions } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-suggest.ts"
);
const { buildQuickMessages } = await import(
  "../../apps/creator-web/src/features/workspace/quick-messages.ts"
);

const REPLY = [
  "สร้างหน้า dashboard เรียบร้อย ข้อมูลตอนนี้เป็น mock อยู่",
  "<suggest>เพิ่มหน้ารายละเอียดลูกค้า</suggest>",
  "<suggest>เชื่อมฐานข้อมูลจริง</suggest>",
  "<suggest>เพิ่มหน้ารายละเอียดลูกค้า</suggest>",
  "<suggest>ทำหน้าจอมือถือ</suggest>",
  "<suggest>ตรวจก่อน publish</suggest>"
].join("\n");

test("extractSuggestions parses tags, dedupes, and caps at three", () => {
  const { text, suggestions } = extractSuggestions(REPLY);
  assert.deepEqual(
    suggestions.map((s) => s.label),
    ["เพิ่มหน้ารายละเอียดลูกค้า", "เชื่อมฐานข้อมูลจริง", "ทำหน้าจอมือถือ"]
  );
  assert.equal(suggestions[0].prompt, "เพิ่มหน้ารายละเอียดลูกค้า");
  assert.doesNotMatch(text, /<suggest>/);
  assert.match(text, /mock อยู่/);
  assert.equal(stripSuggestions(REPLY), text);
});

test("extractSuggestions is a no-op on plain replies", () => {
  const { text, suggestions } = extractSuggestions("done, nothing else.");
  assert.equal(text, "done, nothing else.");
  assert.deepEqual(suggestions, []);
});

const baseContext = {
  mode: "build",
  project: { name: "CRM", appType: "Workflow App" },
  messages: [],
  hasPreview: true,
  hasProjectFiles: false
};

test("model suggestions from the last assistant message replace the heuristics", () => {
  const items = buildQuickMessages({
    ...baseContext,
    messages: [
      { id: "u1", role: "user", text: "สร้าง CRM", actions: [] },
      { id: "a1", role: "assistant", text: REPLY, actions: [] }
    ]
  });
  assert.deepEqual(
    items.map((item) => item.label),
    ["เพิ่มหน้ารายละเอียดลูกค้า", "เชื่อมฐานข้อมูลจริง", "ทำหน้าจอมือถือ"]
  );
});

test("heuristic chips remain the fallback when the model offered none", () => {
  const items = buildQuickMessages(baseContext);
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => !item.id.startsWith("model-suggest")));
});

test("build prompt instructs stage-aware suggest tags", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  assert.match(prompt, /<suggest>/);
  assert.match(prompt, /chips?/i);
  assert.match(prompt, /sync|real database/i);
});
