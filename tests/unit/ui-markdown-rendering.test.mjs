import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React ??= React;

const { Markdown } = await import("../../packages/ui/src/primitives/markdown.tsx");

test("Markdown renders PRD-friendly blocks and GFM tables", () => {
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      text: [
        "# Product requirements",
        "",
        "> Review before baseline.",
        "",
        "- **Owner** approves requests",
        "- Users read `status`",
        "",
        "| Role | Permission |",
        "| :--- | ---: |",
        "| Admin | Approve |",
        "| User | Read \\| comment |",
        "",
        "---",
        "",
        "```json",
        '{"ready":true}',
        "```"
      ].join("\n")
    })
  );

  assert.match(html, /vibe-md-h1/);
  assert.match(html, /vibe-md-quote/);
  assert.match(html, /<strong>Owner<\/strong>/);
  assert.match(html, /<code class="vibe-md-code">status<\/code>/);
  assert.match(html, /<table class="vibe-md-table">/);
  assert.match(html, /<th>Permission<\/th>/);
  assert.match(html, /<td>Read \| comment<\/td>/);
  assert.match(html, /vibe-md-rule/);
  assert.match(html, /vibe-md-pre/);
});

test("Markdown renders safe links and removes unsafe link targets", () => {
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      text: [
        "[Docs](https://example.com/docs)",
        "[Section](#acceptance)",
        "[Unsafe](javascript:evil)",
        "[Protocol relative](//evil.example)"
      ].join(" ")
    })
  );

  assert.match(html, /href="https:\/\/example.com\/docs"/);
  assert.match(html, /href="#acceptance"/);
  assert.match(html, / Unsafe Protocol relative<\/p>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /evil\.example/);
});
