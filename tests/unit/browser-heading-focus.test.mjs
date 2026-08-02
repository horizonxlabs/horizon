import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
let focusCalls = 0;
const heading = {
  tabIndex: 0,
  focus() {
    focusCalls += 1;
  }
};
globalThis.document = {
  querySelector(selector) {
    assert.equal(selector, "main h1");
    return heading;
  }
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { usePageHeadingFocus } = await import("../../packages/ui/src/browser-navigation.ts");

function FocusProbe({ pathname }) {
  usePageHeadingFocus(pathname);
  return React.createElement("main", null, React.createElement("h1", null, "Stable heading"));
}

test("page heading focus runs once for each pathname while loading content can update", async () => {
  focusCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(FocusProbe, { pathname: "/store/apps/one" }));
  });
  assert.equal(focusCalls, 1);
  assert.equal(heading.tabIndex, -1);
  await act(async () => {
    renderer.update(React.createElement(FocusProbe, { pathname: "/store/apps/one" }));
  });
  assert.equal(focusCalls, 1);
  await act(async () => {
    renderer.update(React.createElement(FocusProbe, { pathname: "/store/apps/two" }));
  });
  assert.equal(focusCalls, 2);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
