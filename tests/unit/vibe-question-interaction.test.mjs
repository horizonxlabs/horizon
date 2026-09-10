import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { Button } from "../../packages/ui/src/index.tsx";
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
  const radios = () => renderer.root.findAllByProps({ type: "radio" });
  const selected = () => radios().find((radio) => radio.props.checked)?.props.value;
  const choose = async (value) =>
    act(async () =>
      radios()
        .find((radio) => radio.props.value === value)
        .props.onChange()
    );
  const click = async (button) => act(async () => button.props.onClick());
  const custom = () =>
    renderer.root.findAllByType("input").find((input) => input.props.type !== "radio");
  const typeCustom = async (value) =>
    act(async () => custom().props.onChange({ target: { value } }));
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(renderer.root.findAllByType("select").length, 0);
      assert.equal(renderer.root.findAllByType("fieldset").length, 1);
      assert.equal(renderer.root.findByType("legend").children.join(""), `Scope ${i + 1}?`);
      assert.equal(radios().length, 3);
      assert.equal(new Set(radios().map((radio) => radio.props.name)).size, 1);
      assert.equal(
        renderer.root.findByProps({ role: "status" }).children.join(""),
        `Question ${i + 1} of 4`
      );
      const last = radios().at(-1);
      assert.equal(last.props.value, "__other__");
      assert.equal(
        renderer.root.findAllByType("label").at(-1).findAllByType("span").at(-1).children.join(""),
        "Other — enter your own"
      );
      assert.equal(action().props.disabled, true);
      assert.equal(back().props.disabled, i === 0);
      await choose(i === 0 || i === 3 ? "__other__" : "Team");
      assert.equal(radios().filter((radio) => radio.props.checked).length, 1);
      if (i === 0 || i === 3) {
        await typeCustom("   ");
        assert.equal(action().props.disabled, true);
        await typeCustom(i === 0 ? "  Managers  " : "  เฉพาะ HR  ");
      }
      assert.equal(action().props.disabled, false);
      assert.deepEqual(messages, []);
      if (i < 3) {
        assert.ok(React.Children.toArray(action().props.children).includes("Next"));
        await click(action());
      }
    }
    // Revisit and edit an earlier answer, retaining both choices and custom text.
    for (let i = 0; i < 3; i++) await click(back());
    assert.equal(selected(), "__other__");
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
    assert.ok(radios().every((radio) => radio.props.disabled));
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
      renderer.root.findByProps({ type: "radio", value: "Everyone" }).props.onChange()
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

test("separate chat question blocks have independent native radio groups", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        React.Fragment,
        null,
        ...["first", "second"].map((key) =>
          React.createElement(VibeQuestionBlock, {
            key,
            questions: questions.slice(0, 1),
            disabled: false,
            onSubmit() {}
          })
        )
      )
    );
  });
  try {
    const blocks = renderer.root.findAllByType(VibeQuestionBlock);
    const groups = blocks.map((block) => block.findAllByProps({ type: "radio" }));
    assert.notEqual(groups[0][0].props.name, groups[1][0].props.name);
    await act(async () => groups[0][0].props.onChange());
    assert.equal(groups[0][0].props.checked, true);
    assert.ok(groups[1].every((radio) => !radio.props.checked));
  } finally {
    await act(async () => renderer.unmount());
  }
});
