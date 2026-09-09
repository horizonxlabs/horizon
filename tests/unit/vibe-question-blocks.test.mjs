import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSystemPrompt,
  buildAutoSystemPrompt
} from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { extractQuestions, stripQuestions, buildQuestionAnswerMessage } =
  await import("../../apps/creator-web/src/features/workspace/vibe-questions.ts");

const REPLY = [
  "ก่อนสร้าง ผมขอถาม 2 ข้อครับ",
  "<question>",
  "การอนุมัติใบลามีกี่ขั้น?",
  "- 1 ขั้น (หัวหน้าทีม)",
  "- 2 ขั้น (หัวหน้าทีม + HR)",
  "- ไม่ต้องอนุมัติ",
  "</question>",
  "<question>",
  "พนักงานดูวันลาคงเหลือของคนอื่นได้ไหม?",
  "- ได้เฉพาะหัวหน้า",
  "- ทุกคนเห็นหมด",
  "</question>"
].join("\n");

test("extractQuestions parses batched question blocks with options", () => {
  const { text, questions } = extractQuestions(REPLY);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].question, "การอนุมัติใบลามีกี่ขั้น?");
  assert.deepEqual(questions[0].options, [
    "1 ขั้น (หัวหน้าทีม)",
    "2 ขั้น (หัวหน้าทีม + HR)",
    "ไม่ต้องอนุมัติ"
  ]);
  assert.equal(questions[1].options.length, 2);
  assert.doesNotMatch(text, /<question>/);
  assert.match(text, /ขอถาม 2 ข้อ/);
  assert.equal(stripQuestions(REPLY), text);
});

test("blocks without at least two options are ignored, and questions cap at four", () => {
  const one = "<question>\nถามอะไรดี?\n- ตัวเลือกเดียว\n</question>";
  assert.deepEqual(extractQuestions(one).questions, []);
  const many = Array.from(
    { length: 5 },
    (_, i) => `<question>\nคำถาม ${i}?\n- ก\n- ข\n</question>`
  ).join("\n");
  assert.equal(extractQuestions(many).questions.length, 4);
});

test("answers submit as one combined message", () => {
  const message = buildQuestionAnswerMessage([
    { question: "การอนุมัติใบลามีกี่ขั้น?", answer: "2 ขั้น (หัวหน้าทีม + HR)" },
    { question: "พนักงานดูวันลาคงเหลือของคนอื่นได้ไหม?", answer: "ได้เฉพาะหัวหน้า" }
  ]);
  assert.equal(
    message,
    "Continue the current request using these answers. Keep the same scope and mode:\n\nการอนุมัติใบลามีกี่ขั้น?: 2 ขั้น (หัวหน้าทีม + HR)\nพนักงานดูวันลาคงเหลือของคนอื่นได้ไหม?: ได้เฉพาะหัวหน้า"
  );
});

test("Build and Auto ask one to four scope questions before implementation, then wait", () => {
  const input = {
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  };
  for (const prompt of [buildSystemPrompt(input), buildAutoSystemPrompt(input)]) {
    assert.match(prompt, /including the first build/);
    assert.match(prompt, /1–4 concise questions/);
    assert.match(prompt, /UI displays one question at a time/);
    assert.match(prompt, /Only the last question has "Submit answers"/);
    assert.match(prompt, /Stop after asking and wait/);
    assert.match(prompt, /Do not call mutation tools/);
    assert.match(prompt, /Do not ask again for the same scope/);
    assert.match(prompt, /2–5 concrete options/);
    assert.match(prompt, /automatically appends.*Other/);
    assert.match(prompt, /<question>/);
    assert.doesNotMatch(prompt, /first build, never ask/);
  }
});

test("Auto recognizes submitted answers only as continuation of the pending scoped request", () => {
  const prompt = buildAutoSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  assert.match(prompt, /Continue the current request using these answers/);
  assert.match(prompt, /immediately preceding clarification/);
  assert.match(prompt, /Informational answers remain read-only/);
  assert.match(prompt, /never revive unrelated prior requests/);
});
