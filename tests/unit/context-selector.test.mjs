import test from "node:test";
import assert from "node:assert/strict";
import { selectContextFiles } from "../../apps/platform-api/src/generation-loop/context-selector.ts";

const template = {
  name: "nextjs-base",
  lockedFiles: ["package.json"],
  files: [
    { path: "app/page.tsx", content: "export default function Home() {}" },
    { path: "app/about/page.tsx", content: "export default function About() {}" },
    { path: "package.json", content: "{}" },
    { path: "lib/utils.ts", content: "export const noop = () => {};" }
  ],
};

test("ranks files whose path or content mentions prompt keywords first, capped at maxFiles", () => {
  const result = selectContextFiles(template, "update the about page copy", 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].path, "app/about/page.tsx");
});

test("falls back to the first maxFiles template files when nothing matches", () => {
  const result = selectContextFiles(template, "unrelated request text", 3);
  assert.equal(result.length, 3);
});
