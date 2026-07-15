import { Children, isValidElement, type ReactNode } from "react";

// Pure, framework-agnostic helpers backing the custom `Select` listbox. Kept
// separate from the component so they can be unit-tested without rendering.

export type SelectItem = { value: string; label: ReactNode; disabled: boolean };

type OptionProps = { value?: unknown; children?: ReactNode; disabled?: boolean };

// Parse `<option>` element children into flat items. Non-element children
// (strings, null, numbers) and non-`option` elements are ignored. When an
// option omits `value`, its text label becomes the value (native <select>
// semantics), so value-less options stay selectable.
export function parseSelectOptions(children: ReactNode): SelectItem[] {
  const items: SelectItem[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== "option") continue;
    const props = child.props as OptionProps;
    const label = props.children;
    const value = props.value != null ? String(props.value) : typeof label === "string" ? label : "";
    items.push({ value, label: label ?? value, disabled: Boolean(props.disabled) });
  }
  return items;
}

// Next selectable index in `direction` (1 forward, -1 backward), wrapping at the
// ends and skipping disabled options. Returns `current` when nothing else is
// enabled (or the list is empty).
export function nextEnabledIndex(items: SelectItem[], current: number, direction: 1 | -1): number {
  const count = items.length;
  if (count === 0) return current;
  let index = current;
  for (let step = 0; step < count; step += 1) {
    index = (index + direction + count) % count;
    if (!items[index]?.disabled) return index;
  }
  return current;
}

// Label of the item whose value matches, or undefined when there is no match.
export function selectedLabel(items: SelectItem[], value: string | undefined): ReactNode | undefined {
  return items.find((item) => item.value === value)?.label;
}
