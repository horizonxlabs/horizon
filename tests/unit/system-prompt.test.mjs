import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoSystemPrompt,
  buildSystemPrompt
} from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

test("system prompt lists locked files and embeds context file contents and rolling summary", () => {
  const template = {
    name: "nextjs-base",
    lockedFiles: ["package.json", "next.config.js"],
    files: []
  };
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [{ path: "app/page.tsx", content: "export default function Home() {}" }],
    rollingSummary: "User is building a landing page."
  });

  assert.match(prompt, /package\.json/);
  assert.match(prompt, /next\.config\.js/);
  assert.match(prompt, /app\/page\.tsx/);
  assert.match(prompt, /export default function Home/);
  assert.match(prompt, /User is building a landing page\./);
  assert.match(prompt, /write_workspace_file/);
  assert.match(prompt, /run_workspace_command/);
  assert.match(prompt, /propose_database_migration/);
  assert.doesNotMatch(prompt, /<action|<artifact/);
});

test("omits the rolling summary section when there is no summary yet", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /Conversation summary so far/);
});

test("Build and Auto prompts expose only the controlled package command boundary", () => {
  const input = {
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  };

  for (const prompt of [buildSystemPrompt(input), buildAutoSystemPrompt(input)]) {
    assert.match(prompt, /npm or pnpm.*install\/add.*build, test, typecheck, or lint/is);
    assert.match(prompt, /lifecycle scripts are disabled/i);
    assert.match(prompt, /Never use node, npx, git.*exec\/dlx\/x.*arbitrary package scripts/is);
  }
});

test("Auto prompt answers informational questions without mutation authority", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const prompt = buildAutoSystemPrompt({ template, contextFiles: [], rollingSummary: null });

  assert.match(prompt, /informational, ambiguous, and question-shaped.*read-only by default/is);
  assert.match(prompt, /How could I improve this\?.*does not authorize mutation/is);
  assert.match(prompt, /Improve this page.*authorizes mutation/is);
  assert.match(
    prompt,
    /only a current user message that explicitly asks.*carry out a mutation now grants mutation authority/is
  );
  assert.match(prompt, /prior requests and prior Build turns do not/i);
  assert.match(prompt, /Decide once, from the current message alone, and act/i);
  assert.match(prompt, /never keep reasoning back and forth between two interpretations/i);
  assert.match(prompt, /ตอนนี้ดึงข้อมูลมาจากไหน/);
  assert.match(
    prompt,
    /do not call.*write_workspace_file.*edit_workspace_file.*run_workspace_command.*propose_database_migration/is
  );
  assert.match(prompt, /Explicit create, add, change, fix, remove, install, or implement/i);
  assert.match(prompt, /สร้าง|เพิ่ม|เปลี่ยน|แก้|ลบ|ติดตั้ง/);
  assert.doesNotMatch(prompt, /Make the smallest complete change/i);
  assert.doesNotMatch(prompt, /Improvement requests — go deep/i);
  assert.doesNotMatch(prompt, /Continue using tools until/i);
});

test("Auto excludes prior build authority while explicit Build retains it", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const input = {
    template,
    contextFiles: [],
    rollingSummary: null,
    productSpec: "Keep the existing informational page architecture.",
    approvedPlan: "Step 1: replace the informational page with a dashboard."
  };

  const autoPrompt = buildAutoSystemPrompt(input);
  const buildPrompt = buildSystemPrompt(input);

  assert.match(autoPrompt, /read-only by default/i);
  assert.doesNotMatch(
    autoPrompt,
    /Approved plan|implement exactly it|replace the informational page/
  );
  assert.doesNotMatch(autoPrompt, /Product spec.*build toward it/is);
  assert.doesNotMatch(autoPrompt, /Make the smallest complete change/i);
  assert.doesNotMatch(autoPrompt, /Improvement requests — go deep/i);
  assert.doesNotMatch(autoPrompt, /Continue using tools until/i);
  assert.match(autoPrompt, /Product spec.*reference context only/is);
  assert.match(buildPrompt, /Approved plan.*implement exactly it/is);
  assert.match(buildPrompt, /replace the informational page/);
  assert.match(buildPrompt, /Product spec.*build toward it/is);
  assert.match(buildPrompt, /Make the smallest complete change/i);
  assert.match(buildPrompt, /Improvement requests — go deep/i);
  assert.match(buildPrompt, /Continue using tools until/i);
});

test("Auto prompt carries the Golden Rule, suggest/question tags, and design guidance", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const prompt = buildAutoSystemPrompt({ template, contextFiles: [], rollingSummary: null });

  assert.match(prompt, /THE GOLDEN RULE/);
  assert.match(prompt, /BYTE-FOR-BYTE identical/);
  assert.match(prompt, /<suggest>/);
  assert.match(prompt, /<question>/);
  assert.match(prompt, /Design quality/i);
  assert.match(prompt, /Layout recipes/i);
  assert.match(prompt, /mock-data\.ts/);
});

// Regression: Auto mode never told the model the preview renders app/page.tsx, so a first
// build could land entirely on an orphan route (e.g. app/btc-price/page.tsx) while the live
// preview kept showing the untouched starter homepage — invisible until told to navigate.
test("Auto and Build prompts both anchor the model to app/page.tsx as the live preview", () => {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  const input = { template, contextFiles: [], rollingSummary: null };

  const autoPrompt = buildAutoSystemPrompt(input);
  const buildPrompt = buildSystemPrompt(input);

  assert.match(autoPrompt, /live preview always renders app\/page\.tsx/i);
  assert.match(
    autoPrompt,
    /core or primary feature.*put it directly in app\/page\.tsx/is
  );
  assert.match(buildPrompt, /preview homepage is app\/page\.tsx/i);
  assert.match(
    buildPrompt,
    /core or primary feature.*put it directly in app\/page\.tsx/is
  );
});
