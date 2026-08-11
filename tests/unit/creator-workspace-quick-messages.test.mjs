import assert from "node:assert/strict";
import test from "node:test";

const { buildQuickMessages } = await import(
  "../../apps/creator-web/src/features/workspace/quick-messages.ts"
);

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

test("Build suggestions use project and PRD context", () => {
  const messages = buildQuickMessages({ ...base, mode: "build", hasPreview: true });

  assert.equal(messages.length, 3);
  assert.equal(new Set(messages.map((message) => message.id)).size, 3);
  assert.match(messages[0].label, /Sales KPI/);
  assert.match(messages[0].prompt, /Sales KPI Dashboard/);
  assert.match(messages[0].prompt, /sales performance/i);
});

test("Plan suggestions stay read-only and plan the first preview", () => {
  const messages = buildQuickMessages({ ...base, mode: "plan", hasPreview: false });

  assert.equal(messages.length, 3);
  assert.match(messages.map((message) => message.label).join(" "), /Plan first preview/);
  assert.ok(messages.every((message) => /review|plan|identify|assess/i.test(message.prompt)));
});

test("a failed workspace action becomes the recommended recovery", () => {
  const messages = buildQuickMessages({
    ...base,
    mode: "build",
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
    mode: "build",
    hasPreview: true,
    hasProjectFiles: true
  });

  assert.ok(messages.some((message) => message.id === "use-project-files"));
});
