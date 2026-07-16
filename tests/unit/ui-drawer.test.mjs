import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Drawer renders nothing when closed and a dialog when open", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  const closed = renderToStaticMarkup(
    React.createElement(Drawer, { open: false, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(closed, "");
  const open = renderToStaticMarkup(
    React.createElement(Drawer, { open: true, onClose() {}, title: "Add provider" }, "body"));
  assert.match(open, /role="dialog"/);
  assert.match(open, /aria-modal="true"/);
  assert.match(open, /Add provider/);
});
