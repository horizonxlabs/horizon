import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { CreatorState, CreatorStatusMessage } =
  await import("../../apps/creator-web/src/shared/index.ts");
const { Button, DataTable } = await import("../../packages/ui/src/index.tsx");

test("CreatorState renders a recoverable error with optional technical details", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorState, {
      kind: "error",
      title: "Versions could not be loaded",
      description: "Your existing checkpoints are unchanged.",
      action: React.createElement("button", null, "Retry"),
      technicalDetails: "HTTP 503"
    })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Versions could not be loaded/);
  assert.match(html, /Technical details/);
  assert.match(html, /Retry/);
});

test("CreatorStatusMessage maps danger feedback to alert semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorStatusMessage, { tone: "danger" }, "Publish failed")
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /creator-status-message-danger/);
});

test("DataTable exposes a labeled scroll region and contextual empty state", () => {
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      ariaLabel: "Project members",
      columns: [{ key: "name", label: "Name" }],
      rows: [],
      emptyMessage: "No members have access yet."
    })
  );
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Project members"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /No members have access yet/);
});

test("Button supports a danger-outline action hierarchy", () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { variant: "dangerOutline" }, "Reject")
  );
  assert.match(html, /text-danger/);
  assert.match(html, /border-danger/);
});
