import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Drawer renders nothing under SSR whether closed or open (Radix portals to the client DOM)", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  // Closed: Radix Dialog.Root renders nothing.
  const closed = renderToStaticMarkup(
    React.createElement(Drawer, { open: false, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(closed, "");
  // Open: Dialog.Content is portaled, so react-dom/server emits nothing. The open
  // panel's markup and modality (role=dialog, aria-modal, focus trap) are verified
  // visually — they cannot be asserted through this SSR harness.
  const open = renderToStaticMarkup(
    React.createElement(Drawer, { open: true, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(open, "");
});

test("Drawer renders without throwing for every size", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  for (const size of ["md", "lg", "xl"]) {
    assert.doesNotThrow(() =>
      renderToStaticMarkup(
        React.createElement(
          Drawer,
          { open: true, onClose() {}, title: "T", description: "D", footer: "F", size },
          "body"
        )
      )
    );
  }
});
