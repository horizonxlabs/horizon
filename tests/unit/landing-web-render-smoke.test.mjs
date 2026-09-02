import test from "node:test";
import assert from "node:assert/strict";

// Server components rendered statically; no browser globals, no effects.
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
};

const React = (await import("react")).default;
globalThis.React = React;
const { renderToStaticMarkup } = await import("react-dom/server");

const base = "../../apps/landing-web/src";

const { siteConfig } = await import(`${base}/shared/site-config.ts`);
const { Section } = await import(`${base}/shared/section.tsx`);
const { SectionHeading } = await import(`${base}/shared/section-heading.tsx`);
const { ActionButton } = await import(`${base}/shared/action-button.tsx`);
const { Reveal } = await import(`${base}/shared/reveal.tsx`);

test("site config points at the public repository", () => {
  assert.equal(
    siteConfig.repositoryUrl,
    "https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform"
  );
  assert.ok(siteConfig.navItems.length > 0);
});

test("Section renders an anchorable band", () => {
  const html = renderToStaticMarkup(
    React.createElement(Section, { id: "demo" }, React.createElement("p", null, "body"))
  );
  assert.match(html, /id="demo"/);
  assert.match(html, /body/);
});

test("SectionHeading renders eyebrow, title and description", () => {
  const html = renderToStaticMarkup(
    React.createElement(SectionHeading, {
      eyebrow: "Eyebrow",
      title: "Title",
      description: "Description"
    })
  );
  for (const text of ["Eyebrow", "Title", "Description"]) {
    assert.match(html, new RegExp(text));
  }
});

test("ActionButton marks external links safe", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActionButton, {
      action: { label: "GitHub", href: "https://example.com", external: true },
      variant: "secondary"
    })
  );
  assert.match(html, /rel="noreferrer"/);
  assert.match(html, /target="_blank"/);
});

test("Reveal renders its children in the server output", () => {
  const html = renderToStaticMarkup(
    React.createElement(Reveal, null, React.createElement("p", null, "visible"))
  );
  assert.match(html, /visible/);
});
