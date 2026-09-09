import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { Button, Select } from "../../packages/ui/src/index.tsx";
import { VibeQuestionBlock } from "../../apps/creator-web/src/features/workspace/VibeQuestionBlock.tsx";
import { extractQuestions } from "../../apps/creator-web/src/features/workspace/vibe-questions.ts";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.HTMLFormElement = class HTMLFormElement {};
globalThis.window = { setTimeout, clearTimeout };
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const questions = extractQuestions(
  Array.from(
    { length: 4 },
    (_, i) => `<question>\nScope ${i + 1}?\n- Team\n- Everyone\n</question>`
  ).join("\n")
).questions;

test("four questions always end with free text and submit all answers in one chat message", async () => {
  const messages = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(VibeQuestionBlock, {
        questions,
        disabled: false,
        onSubmit: (message) => messages.push(message)
      })
    );
  });
  try {
    const selects = () => renderer.root.findAllByType(Select);
    const submit = () => renderer.root.findByType(Button);
    assert.equal(selects().length, 4);
    assert.equal(submit().props.disabled, true);
    for (const select of selects()) {
      const last = React.Children.toArray(select.props.children).at(-1);
      assert.equal(last.props.value, "__other__");
      assert.equal(last.props.children, "Other — enter your own");
    }
    for (let i = 0; i < 3; i++) {
      await act(async () => selects()[i].props.onChange({ target: { value: "Team" } }));
    }
    assert.equal(submit().props.disabled, true);
    await act(async () => selects()[3].props.onChange({ target: { value: "__other__" } }));
    const custom = () => renderer.root.findByType("input");
    await act(async () => custom().props.onChange({ target: { value: "   " } }));
    assert.equal(submit().props.disabled, true);
    await act(async () => custom().props.onChange({ target: { value: "  เฉพาะ HR  " } }));
    assert.equal(submit().props.disabled, false);
    assert.deepEqual(messages, []);
    await act(async () => submit().props.onClick());
    assert.deepEqual(messages, [
      "Continue the current request using these answers. Keep the same scope and mode:\n\n" +
        "Scope 1?: Team\nScope 2?: Team\nScope 3?: Team\nScope 4?: เฉพาะ HR"
    ]);
    await act(async () =>
      renderer.update(
        React.createElement(VibeQuestionBlock, {
          questions,
          disabled: true,
          onSubmit: (message) => messages.push(message)
        })
      )
    );
    assert.equal(submit().props.disabled, true);
    assert.ok(selects().every((select) => select.props.disabled));
    assert.equal(custom().props.disabled, true);
  } finally {
    await act(async () => renderer.unmount());
  }
});
