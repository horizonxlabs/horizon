import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

const { QuickMessages } = await import(
  "../../apps/creator-web/src/features/workspace/QuickMessages.tsx"
);

const items = [
  {
    id: "one",
    label: "Improve Sales KPI",
    prompt: "Full contextual prompt one",
    intent: "product"
  },
  {
    id: "two",
    label: "Polish loading states",
    prompt: "Full contextual prompt two",
    intent: "quality"
  },
  {
    id: "three",
    label: "Make it mobile-ready",
    prompt: "Full contextual prompt three",
    intent: "quality"
  }
];

test("selecting a Quick Message submits its full prompt immediately", async () => {
  const submissions = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(QuickMessages, {
        items,
        disabled: false,
        onSubmit: (prompt) => submissions.push(prompt)
      })
    );
  });

  await act(async () => renderer.root.findAllByType("button")[0].props.onClick());
  assert.deepEqual(submissions, ["Full contextual prompt one"]);
});

test("Quick Messages are native disabled buttons during an AI turn", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(QuickMessages, { items, disabled: true, onSubmit() {} })
    );
  });

  const buttons = renderer.root.findAllByType("button");
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every((button) => button.props.disabled === true));
});

test("the recommended Quick Message is identified without relying on color", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(QuickMessages, { items, disabled: false, onSubmit() {} })
    );
  });

  const section = renderer.root.findByType("section");
  const firstButton = renderer.root.findAllByType("button")[0];
  assert.equal(section.props["aria-label"], "Suggested next");
  assert.equal(firstButton.props["aria-label"], "Recommended: Improve Sales KPI");
});
