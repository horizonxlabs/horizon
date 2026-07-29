import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Select } from "../../packages/ui/src/index.tsx";

function renderSelect(value) {
  return renderToStaticMarkup(
    React.createElement(
      Select,
      { value, onChange: () => {}, name: "sensitivity", id: "s1", "aria-label": "sensitivity" },
      React.createElement("option", { value: "internal" }, "Internal"),
      React.createElement("option", { value: "confidential" }, "Confidential")
    )
  );
}

test("Select renders a trigger with the design-system trigger classes + aria-label", () => {
  const html = renderSelect("internal");
  assert.match(html, /<button/);
  assert.match(html, /focus:ring-primary-soft/);
  assert.match(html, /aria-label="sensitivity"/);
});

test("Select is Radix-backed: renders a hidden native <select> for form submission", () => {
  const html = renderSelect("internal");
  assert.match(html, /<select/);
});

test("Select renders without throwing when no value is selected", () => {
  assert.doesNotThrow(() => renderSelect(undefined));
});
