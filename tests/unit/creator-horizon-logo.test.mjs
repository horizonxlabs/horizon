import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { HorizonLogo } = await import("../../apps/creator-web/src/shared/HorizonLogo.tsx");

test("Horizon logo renders the new mark with an accessible brand name", () => {
  const html = renderToStaticMarkup(React.createElement(HorizonLogo, { variant: "wordmark" }));

  assert.match(html, /src="\/creator\/horizon-mark\.png"/);
  assert.match(html, /class="horizon-brand-name">Horizon<\/span>/);
  assert.match(html, /aria-label="Horizon"/);
});

test("collapsed Horizon logo exposes only the new mark", () => {
  const html = renderToStaticMarkup(React.createElement(HorizonLogo));

  assert.match(html, /horizon-logo-full/);
  assert.match(html, /horizon-logo-icon/);
  assert.equal((html.match(/<img[^>]+horizon-mark\.png/g) ?? []).length, 2);
});
