import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { extractQuestions, stripQuestions, buildQuestionAnswerMessage } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-questions.ts"
);

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

test("blocks without at least two options are ignored, and questions cap at three", () => {
  const one = "<question>\nถามอะไรดี?\n- ตัวเลือกเดียว\n</question>";
  assert.deepEqual(extractQuestions(one).questions, []);
  const many = Array.from(
    { length: 5 },
    (_, i) => `<question>\nคำถาม ${i}?\n- ก\n- ข\n</question>`
  ).join("\n");
  assert.equal(extractQuestions(many).questions.length, 3);
});

test("answers submit as one combined message", () => {
  const message = buildQuestionAnswerMessage([
    { question: "การอนุมัติใบลามีกี่ขั้น?", answer: "2 ขั้น (หัวหน้าทีม + HR)" },
    { question: "พนักงานดูวันลาคงเหลือของคนอื่นได้ไหม?", answer: "ได้เฉพาะหัวหน้า" }
  ]);
  assert.equal(
    message,
    "การอนุมัติใบลามีกี่ขั้น?: 2 ขั้น (หัวหน้าทีม + HR)\nพนักงานดูวันลาคงเหลือของคนอื่นได้ไหม?: ได้เฉพาะหัวหน้า"
  );
});

test("prompt teaches batched dropdown questions but forbids them on the first build", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  assert.match(prompt, /<question>/);
  assert.match(prompt, /first build.*never ask|never ask.*first build/i);
  assert.match(prompt, /assume/i);
  assert.match(prompt, /dropdown/i);
});
