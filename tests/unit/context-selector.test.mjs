import test from "node:test";
import assert from "node:assert/strict";
import {
  selectContextFiles,
  selectContextPaths,
  selectLiveContextFiles
} from "../../apps/platform-api/src/generation-loop/context-selector.ts";

const template = {
  name: "nextjs-base",
  lockedFiles: ["package.json"],
  files: [
    { path: "app/page.tsx", content: "export default function Home() {}" },
    { path: "app/about/page.tsx", content: "export default function About() {}" },
    { path: "package.json", content: "{}" },
    { path: "lib/utils.ts", content: "export const noop = () => {};" }
  ]
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

test("selects explicit workspace paths before core files and keeps stable unique order", () => {
  const paths = [
    "components/ui/button.tsx",
    "app/layout.tsx",
    "app/page.tsx",
    "app/reports/page.tsx",
    "lib/mock-data.ts",
    "app/globals.css"
  ];

  assert.deepEqual(selectContextPaths(paths, "Fix app/reports/page.tsx and the report button", 4), [
    "app/reports/page.tsx",
    "components/ui/button.tsx",
    "app/page.tsx",
    "app/layout.tsx"
  ]);
});

test("live context is bounded by file count and total characters", () => {
  const result = selectLiveContextFiles(
    [
      { path: "app/page.tsx", content: "p".repeat(8) },
      { path: "app/layout.tsx", content: "l".repeat(8) },
      { path: "app/globals.css", content: "c".repeat(8) }
    ],
    "update the page layout css",
    { maxFiles: 3, maxChars: 12 }
  );

  assert.deepEqual(result, [
    { path: "app/page.tsx", content: "p".repeat(8) },
    { path: "app/layout.tsx", content: "l".repeat(4) }
  ]);
  assert.ok(result.reduce((total, file) => total + file.content.length, 0) <= 12);
});
