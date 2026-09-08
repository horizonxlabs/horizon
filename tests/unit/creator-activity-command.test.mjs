import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { VibeActionSummary } =
  await import("../../apps/creator-web/src/features/workspace/VibeActionSummary.tsx");

test("running command Activity shows the exact command above its live output", () => {
  const html = renderToStaticMarkup(
    React.createElement(VibeActionSummary, {
      actions: [
        {
          id: "shell-1",
          type: "shell",
          label: "pnpm run build",
          status: "running",
          body: "vite building...\n✓ built"
        }
      ]
    })
  );

  assert.match(html, /vibe-action-command/);
  assert.match(html, /\$ pnpm run build/);
  assert.match(html, /vite building\.\.\./);
  assert.match(html, /✓ built/);
});

test("Activity summary uses the compact low-emphasis row treatment", async () => {
  const css = await readFile("packages/ui/styles.css", "utf8");

  assert.match(
    css,
    /\.vibe-action-rollup\s*\{[^}]*background: transparent;[^}]*border: 0;[^}]*min-height: 30px;[^}]*padding: 3px 2px;/s
  );
  assert.match(
    css,
    /\.vibe-action-rollup-icon\s*\{[^}]*background: transparent;[^}]*flex: 0 0 18px;[^}]*height: 18px;/s
  );
});
