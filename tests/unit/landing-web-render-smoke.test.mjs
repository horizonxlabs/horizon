import test from "node:test";
import assert from "node:assert/strict";

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

test("Reveal renders visible content in the server output", () => {
  const html = renderToStaticMarkup(
    React.createElement(Reveal, null, React.createElement("p", null, "visible"))
  );
  assert.match(html, /visible/);
  assert.match(html, /class="evcp-reveal"/);
});

test("the landing app ships no client components", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const roots = ["apps/landing-web/src/shared", "apps/landing-web/src/app"];
  for (const root of roots) {
    for (const entry of await readdir(root, { recursive: true })) {
      if (!entry.endsWith(".tsx") && !entry.endsWith(".ts")) continue;
      const source = await readFile(`${root}/${entry}`, "utf8");
      assert.doesNotMatch(source, /^\s*["']use client["']/m, `${root}/${entry} is a client component`);
    }
  }
});

test("ActionButton omits target and rel for an internal link", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActionButton, {
      action: { label: "Get started", href: "#self-host" },
      variant: "primary"
    })
  );
  assert.doesNotMatch(html, /target=/);
  assert.doesNotMatch(html, /rel=/);
});
