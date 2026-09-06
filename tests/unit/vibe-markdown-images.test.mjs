import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { VibeMarkdown } = await import(
  "../../apps/creator-web/src/features/workspace/VibeMarkdown.tsx"
);

const IMAGE_BASE = "/preview/prj-abc";

function render(text, imageBase = IMAGE_BASE) {
  return renderToStaticMarkup(React.createElement(VibeMarkdown, { text, imageBase }));
}

test("a generated-image markdown line renders a same-origin preview thumbnail", () => {
  const html = render("สร้างเสร็จแล้ว\n\n![hero tractor](public/generated/hero-tractor.png)");
  assert.match(html, /<img[^>]+class="vibe-md-img"/);
  assert.match(html, /src="\/preview\/prj-abc\/generated\/hero-tractor\.png"/);
  assert.match(html, /alt="hero tractor"/);
  assert.match(html, /loading="lazy"/);
  // the /generated/-prefixed and bare forms also resolve
  assert.match(render("![x](/generated/a.png)"), /src="\/preview\/prj-abc\/generated\/a\.png"/);
  assert.match(render("![x](generated/a.png)"), /src="\/preview\/prj-abc\/generated\/a\.png"/);
});

test("anything outside public/generated/*.png renders as plain text — no <img>, ever", () => {
  const hostile = [
    "![x](javascript:alert(1))",
    "![x](data:image/png;base64,AAAA)",
    "![x](https://evil.example/x.png)",
    "![x](public/generated/../../../etc/passwd)",
    "![x](public/generated/%2e%2e/x.png)",
    "![x](public/generated/a.svg)",
    "![x](app/page.tsx)"
  ];
  for (const text of hostile) {
    const html = render(text);
    assert.equal(html.includes("<img"), false, `expected no <img> for ${text}`);
    assert.match(html, /!\[x\]/, `raw token should remain visible for ${text}`);
  }
});

test("without an imageBase the token stays plain text (no unprefixed src can leak)", () => {
  const html = renderToStaticMarkup(
    React.createElement(VibeMarkdown, { text: "![hero](public/generated/hero.png)" })
  );
  assert.equal(html.includes("<img"), false);
  assert.match(html, /!\[hero\]/);
});
