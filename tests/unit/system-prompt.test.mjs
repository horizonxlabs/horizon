import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

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
