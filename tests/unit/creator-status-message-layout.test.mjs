import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatorStatusMessage } from "../../apps/creator-web/src/shared/CreatorStatusMessage.tsx";

test("status outcome and technical disclosure render as separate rows in one semantic status", async () => {
  const html = renderToStaticMarkup(
    React.createElement(
      CreatorStatusMessage,
      { tone: "warning", technicalDetails: "readiness API unavailable" },
      React.createElement("p", null, "Access information loaded. Publish readiness unavailable.")
    )
  );
  assert.match(html, /role="status"/);
  assert.match(
    html,
    /<div><p>Access information loaded[\s\S]*?<\/div><details><summary>Technical details<\/summary>/
  );

  const css = await readFile("packages/ui/styles.css", "utf8");
  assert.match(
    css,
    /\.creator-state\s*\{[\s\S]*?display:\s*flex[\s\S]*?\}[\s\S]*?\.creator-status-message\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/
  );
});
