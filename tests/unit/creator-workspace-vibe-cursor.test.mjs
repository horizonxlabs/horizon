import assert from "node:assert/strict";
import test from "node:test";

const React = (await import("react")).default;
globalThis.React = React;
const { renderToStaticMarkup } = await import("react-dom/server");
const { VibeTurnTimeline } = await import(
  "../../apps/creator-web/src/features/workspace/VibeTurnTimeline.tsx"
);

const legacy = { text: "", actions: [] };

test("an empty live assistant turn renders one font-independent loading indicator", () => {
  const html = renderToStaticMarkup(
    React.createElement(VibeTurnTimeline, { parts: [], legacy, live: true })
  );

  assert.equal(html.match(/class="vibe-inline-loader"/g)?.length, 1);
  assert.doesNotMatch(html, /▋/);
});

test("a completed assistant turn does not render the loading indicator", () => {
  const html = renderToStaticMarkup(
    React.createElement(VibeTurnTimeline, { parts: [], legacy, live: false })
  );

  assert.doesNotMatch(html, /vibe-inline-loader/);
});
