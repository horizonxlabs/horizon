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

test("questions advance locally one at a time and submit only the completed batch", async () => {
  const messages = [];
  const props = { questions, disabled: false, onSubmit: (message) => messages.push(message) };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(VibeQuestionBlock, props));
  });
  const buttons = () => renderer.root.findAllByType(Button);
  const action = () => buttons().at(-1);
  const back = () => buttons()[0];
  const select = () => renderer.root.findByType(Select);
  const choose = async (value) => act(async () => select().props.onChange({ target: { value } }));
  const click = async (button) => act(async () => button.props.onClick());
  const custom = () => renderer.root.findByType("input");
  const typeCustom = async (value) =>
    act(async () => custom().props.onChange({ target: { value } }));
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(renderer.root.findAllByType(Select).length, 1);
      assert.equal(select().props.id, `vq-q-${i}`);
      assert.equal(
        renderer.root.findByProps({ role: "status" }).children.join(""),
        `Question ${i + 1} of 4`
      );
      const last = React.Children.toArray(select().props.children).at(-1);
      assert.equal(last.props.value, "__other__");
      assert.equal(last.props.children, "Other — enter your own");
      assert.equal(action().props.disabled, true);
      assert.equal(back().props.disabled, i === 0);
      await choose(i === 0 || i === 3 ? "__other__" : "Team");
      if (i === 0 || i === 3) {
        await typeCustom("   ");
        assert.equal(action().props.disabled, true);
        await typeCustom(i === 0 ? "  Managers  " : "  เฉพาะ HR  ");
      }
      assert.equal(action().props.disabled, false);
      assert.deepEqual(messages, []);
      if (i < 3) {
        assert.equal(action().props.children, "Next");
        await click(action());
      }
    }
    // Revisit and edit an earlier answer, retaining both choices and custom text.
    for (let i = 0; i < 3; i++) await click(back());
    assert.equal(select().props.value, "__other__");
    assert.equal(custom().props.value, "  Managers  ");
    await typeCustom("Team leads");
    await choose("Everyone");
    await choose("__other__");
    assert.equal(custom().props.value, "Team leads");
    for (let i = 0; i < 3; i++) await click(action());
    assert.equal(custom().props.value, "  เฉพาะ HR  ");
    assert.deepEqual(messages, []);
    assert.match(
      React.Children.toArray(action().props.children)
        .filter((child) => typeof child !== "object")
        .join(""),
      /Submit answers \(4\)/
    );
    await act(async () =>
      renderer.update(React.createElement(VibeQuestionBlock, { ...props, disabled: true }))
    );
    assert.ok(buttons().every((button) => button.props.disabled));
    assert.equal(select().props.disabled, true);
    assert.equal(custom().props.disabled, true);
    await act(async () => renderer.update(React.createElement(VibeQuestionBlock, props)));
    await click(action());
    assert.deepEqual(messages, [
      "Continue the current request using these answers. Keep the same scope and mode:\n\n" +
        "Scope 1?: Team leads\nScope 2?: Team\nScope 3?: Team\nScope 4?: เฉพาะ HR"
    ]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("one question can submit directly after answering", async () => {
  const messages = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(VibeQuestionBlock, {
        questions: questions.slice(0, 1),
        disabled: false,
        onSubmit: (message) => messages.push(message)
      })
    );
  });
  try {
    const action = () => renderer.root.findAllByType(Button).at(-1);
    assert.equal(action().props.disabled, true);
    assert.equal(
      renderer.root.findByProps({ role: "status" }).children.join(""),
      "Question 1 of 1"
    );
    await act(async () =>
      renderer.root.findByType(Select).props.onChange({ target: { value: "Everyone" } })
    );
    assert.equal(action().props.disabled, false);
    assert.deepEqual(messages, []);
    await act(async () => action().props.onClick());
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Scope 1\?: Everyone$/);
  } finally {
    await act(async () => renderer.unmount());
  }
});
