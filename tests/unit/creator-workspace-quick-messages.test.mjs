import assert from "node:assert/strict";
import test from "node:test";

const { buildQuickMessages } =
  await import("../../apps/creator-web/src/features/workspace/quick-messages.ts");

const base = {
  project: { name: "Sales KPI Dashboard", appType: "Dashboard" },
  prdSummary: "Track sales performance by representative and period.",
  prdSections: [
    {
      key: "requirements",
      title: "Sales performance filters",
      body: "Filter KPI results by sales representative and reporting period.",
      order: 1
    }
  ],
  messages: [],
  hasProjectFiles: false
};

test("Auto suggestions mix explicit review and mutation intents using project context", () => {
  const messages = buildQuickMessages({ ...base, hasPreview: true });

  assert.equal(messages.length, 3);
  assert.deepEqual(
    messages.map((message) => message.id),
    ["next-prd-improvement", "review-prd", "polish-edge-states"]
  );
  assert.ok(messages.every((message) => /Sales KPI Dashboard/.test(message.prompt)));
  assert.ok(messages.some((message) => /without changing files/i.test(message.prompt)));
  assert.ok(messages.some((message) => /\b(?:Build|Implement|Fix|Improve)\b/.test(message.prompt)));
  assert.ok(
    messages.every(
      (message) =>
        /without changing files/i.test(message.prompt) ||
        /\b(?:Build|Implement|Fix|Improve)\b/.test(message.prompt)
    )
  );
});

test("a failed workspace action becomes the recommended recovery", () => {
  const messages = buildQuickMessages({
    ...base,
    hasPreview: true,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        text: "The change failed.",
        actions: [{ id: "action-1", type: "edit", label: "app/page.tsx", status: "failed" }]
      }
    ]
  });

  assert.equal(messages[0].id, "repair-last-action");
  assert.match(messages[0].label, /Fix app\/page\.tsx/);
  assert.match(messages[0].prompt, /diagnose and fix/i);
});

test("attached files produce a project-file suggestion", () => {
  const messages = buildQuickMessages({
    ...base,
    hasPreview: true,
    hasProjectFiles: true
  });

  assert.deepEqual(
    messages.map((message) => message.id),
    ["next-prd-improvement", "review-prd", "use-project-files"]
  );
});

test("model-authored suggestions remain authoritative", () => {
  const messages = buildQuickMessages({
    ...base,
    hasPreview: true,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        text: "Done.\n<suggest>Connect the live sales feed</suggest>",
        actions: []
      }
    ]
  });

  assert.deepEqual(
    messages.map((message) => message.prompt),
    ["Connect the live sales feed"]
  );
});
