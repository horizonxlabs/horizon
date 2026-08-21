import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { VibeWorkingIndicator } = await import(
  "../../apps/creator-web/src/features/workspace/VibeWorkingIndicator.tsx"
);

test("working indicator renders an animated, polite live-status row while a turn runs", () => {
  const html = renderToStaticMarkup(
    React.createElement(VibeWorkingIndicator, { active: true, status: "Inspecting…" })
  );
  assert.match(html, /vibe-working/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Inspecting…/);
  // three animation dots so the row visibly moves even when the status text is static
  assert.equal((html.match(/class="vibe-working-dot"/g) ?? []).length, 3);
});

test("working indicator falls back to a generic working label and hides when idle", () => {
  const fallback = renderToStaticMarkup(
    React.createElement(VibeWorkingIndicator, { active: true, status: "" })
  );
  assert.match(fallback, /AI is working/);
  const idle = renderToStaticMarkup(
    React.createElement(VibeWorkingIndicator, { active: false, status: "Inspecting…" })
  );
  assert.equal(idle, "");
});
