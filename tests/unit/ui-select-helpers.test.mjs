import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import {
  parseSelectOptions,
  nextEnabledIndex,
  selectedLabel
} from "../../packages/ui/src/primitives/select-helpers.ts";

test("parseSelectOptions extracts value, label and disabled from <option> children", () => {
  const items = parseSelectOptions([
    h("option", { value: "a" }, "A"),
    h("option", { value: "b", disabled: true }, "B")
  ]);
  assert.deepEqual(
    items.map((item) => ({ value: item.value, label: item.label, disabled: item.disabled })),
    [
      { value: "a", label: "A", disabled: false },
      { value: "b", label: "B", disabled: true }
    ]
  );
});

test("parseSelectOptions ignores non-element children", () => {
  const items = parseSelectOptions([
    "just text",
    null,
    undefined,
    h("option", { value: "x" }, "X")
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].value, "x");
});

test("parseSelectOptions falls back to the label text when value is absent", () => {
  const items = parseSelectOptions([h("option", null, "Sales")]);
  assert.equal(items.length, 1);
  assert.equal(items[0].value, "Sales");
  assert.equal(items[0].label, "Sales");
});

test("nextEnabledIndex moves forward and backward", () => {
  const items = [
    { value: "a", label: "A", disabled: false },
    { value: "b", label: "B", disabled: false },
    { value: "c", label: "C", disabled: false }
  ];
  assert.equal(nextEnabledIndex(items, 0, 1), 1);
  assert.equal(nextEnabledIndex(items, 2, -1), 1);
});

test("nextEnabledIndex wraps around the ends", () => {
  const items = [
    { value: "a", label: "A", disabled: false },
    { value: "b", label: "B", disabled: false }
  ];
  assert.equal(nextEnabledIndex(items, 1, 1), 0);
  assert.equal(nextEnabledIndex(items, 0, -1), 1);
});

test("nextEnabledIndex skips disabled options", () => {
  const items = [
    { value: "a", label: "A", disabled: false },
    { value: "b", label: "B", disabled: true },
    { value: "c", label: "C", disabled: false }
  ];
  assert.equal(nextEnabledIndex(items, 0, 1), 2);
  assert.equal(nextEnabledIndex(items, 2, -1), 0);
});

test("nextEnabledIndex returns current when no other option is enabled", () => {
  const items = [
    { value: "a", label: "A", disabled: false },
    { value: "b", label: "B", disabled: true }
  ];
  assert.equal(nextEnabledIndex(items, 0, 1), 0);
});

test("selectedLabel finds the label by value", () => {
  const items = [
    { value: "a", label: "Alpha", disabled: false },
    { value: "b", label: "Beta", disabled: false }
  ];
  assert.equal(selectedLabel(items, "b"), "Beta");
});

test("selectedLabel returns undefined when the value is absent", () => {
  const items = [{ value: "a", label: "Alpha", disabled: false }];
  assert.equal(selectedLabel(items, "z"), undefined);
  assert.equal(selectedLabel(items, undefined), undefined);
});
