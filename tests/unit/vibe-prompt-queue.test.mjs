import test from "node:test";
import assert from "node:assert/strict";

const { enqueuePrompt, removeQueued, takeNext, MAX_QUEUED_PROMPTS } = await import(
  "../../apps/creator-web/src/features/workspace/vibe-queue.ts"
);

test("prompts queue in order with unique ids and survive removal by id", () => {
  let queue = [];
  queue = enqueuePrompt(queue, { prompt: "เพิ่มหน้ารายงาน", mode: "build" });
  queue = enqueuePrompt(queue, { prompt: "ทำ dark mode", mode: "build" });
  queue = enqueuePrompt(queue, { prompt: "รีวิวความเสี่ยง", mode: "plan" });
  assert.equal(queue.length, 3);
  assert.equal(new Set(queue.map((item) => item.id)).size, 3);
  assert.deepEqual(
    queue.map((item) => item.prompt),
    ["เพิ่มหน้ารายงาน", "ทำ dark mode", "รีวิวความเสี่ยง"]
  );
  queue = removeQueued(queue, queue[1].id);
  assert.deepEqual(
    queue.map((item) => item.prompt),
    ["เพิ่มหน้ารายงาน", "รีวิวความเสี่ยง"]
  );
});

test("takeNext hands out the head in FIFO order and keeps the rest", () => {
  let queue = [];
  queue = enqueuePrompt(queue, { prompt: "หนึ่ง", mode: "build" });
  queue = enqueuePrompt(queue, { prompt: "สอง", mode: "plan" });
  const { next, rest } = takeNext(queue);
  assert.equal(next?.prompt, "หนึ่ง");
  assert.equal(next?.mode, "build");
  assert.deepEqual(rest.map((item) => item.prompt), ["สอง"]);
  assert.deepEqual(takeNext([]), { next: undefined, rest: [] });
});

test("blank prompts are rejected and the queue is capped", () => {
  let queue = enqueuePrompt([], { prompt: "   ", mode: "build" });
  assert.equal(queue.length, 0);
  for (let i = 0; i < MAX_QUEUED_PROMPTS + 5; i += 1) {
    queue = enqueuePrompt(queue, { prompt: `งานที่ ${i}`, mode: "build" });
  }
  assert.equal(queue.length, MAX_QUEUED_PROMPTS);
});
