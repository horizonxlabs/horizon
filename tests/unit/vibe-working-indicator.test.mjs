import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { VibeWorkingIndicator } =
  await import("../../apps/creator-web/src/features/workspace/VibeWorkingIndicator.tsx");

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

test("working indicator animations stop when reduced motion is requested", () => {
  const css = readFileSync(new URL("../../packages/ui/styles.css", import.meta.url), "utf8");
  const animationEnd = css.indexOf("@keyframes vibe-working-wave");
  const reducedStart = css.indexOf("@media (prefers-reduced-motion: reduce)", animationEnd);
  const reducedMotion = css.slice(reducedStart, reducedStart + 700);
  assert.match(
    reducedMotion,
    /\.vibe-working-icon,\s*\.vibe-working-dot\s*\{\s*animation:\s*none\s*!important;/
  );
});
