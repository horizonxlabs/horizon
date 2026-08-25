import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Drawer renders nothing under SSR whether closed or open (Radix portals to the client DOM)", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  // Closed: Radix Dialog.Root renders nothing.
  const closed = renderToStaticMarkup(
    React.createElement(Drawer, { open: false, onClose() {}, title: "Add provider" }, "body")
  );
  assert.equal(closed, "");
  // Open: Dialog.Content is portaled, so react-dom/server emits nothing. The open
  // panel's markup and modality (role=dialog, aria-modal, focus trap) are verified
  // visually — they cannot be asserted through this SSR harness.
  const open = renderToStaticMarkup(
    React.createElement(Drawer, { open: true, onClose() {}, title: "Add provider" }, "body")
  );
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

test("Drawer maps Escape dismissal and restores focus to its external trigger", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  let closes = 0;
  let focuses = 0;
  const tree = Drawer({
    open: true,
    onClose() {
      closes += 1;
    },
    title: "Invite user",
    returnFocusRef: { current: { focus: () => (focuses += 1) } },
    children: "body"
  });

  tree.props.onOpenChange(false);
  assert.equal(closes, 1, "Escape and overlay dismissals request a controlled close");

  const portal = tree.props.children;
  const content = portal.props.children[1];
  let prevented = 0;
  content.props.onCloseAutoFocus({ preventDefault: () => (prevented += 1) });
  assert.equal(prevented, 1);
  assert.equal(focuses, 1);
});

test("Drawer moves focus to an explicit initial field when it opens", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  let focuses = 0;
  const tree = Drawer({
    open: true,
    onClose() {},
    title: "Invite user",
    initialFocusRef: { current: { focus: () => (focuses += 1) } },
    children: "body"
  });
  const content = tree.props.children.props.children[1];
  let prevented = 0;
  content.props.onOpenAutoFocus({ preventDefault: () => (prevented += 1) });
  assert.equal(prevented, 1);
  assert.equal(focuses, 1);
});

test("Drawer close control is a 44px touch target", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  const tree = Drawer({ open: true, onClose() {}, title: "Invite user", children: "body" });
  const portal = tree.props.children;
  const content = portal.props.children[1];
  const header = content.props.children[0];
  const close = header.props.children[1];
  assert.match(close.props.className, /min-h-11/);
  assert.match(close.props.className, /min-w-11/);
});
