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
  const roots = [
    "apps/landing-web/src/shared",
    "apps/landing-web/src/app",
    "apps/landing-web/src/features"
  ];
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

const { SiteNav } = await import(`${base}/shared/site-nav.tsx`);
const { SiteFooter } = await import(`${base}/shared/site-footer.tsx`);

test("SiteNav lists configured anchor links and the repository link", () => {
  const html = renderToStaticMarkup(React.createElement(SiteNav));
  for (const item of siteConfig.navItems) {
    assert.match(html, new RegExp(`href="${item.href}"`));
    assert.match(html, new RegExp(item.label));
  }
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("SiteFooter states the project name without claiming a licence", () => {
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  assert.match(html, /Horizon/);
  assert.doesNotMatch(html, /licen[sc]e/i);
});

const { HeroSection } = await import(`${base}/features/hero`);
const { SurfacesSection, surfacesContent } = await import(`${base}/features/surfaces`);
const { LifecycleSection, lifecycleContent } = await import(`${base}/features/lifecycle`);
const { GovernanceSection, governanceContent } = await import(`${base}/features/governance`);
const { SelfHostSection, selfHostContent } = await import(`${base}/features/self-host`);

test("HeroSection renders the headline and both actions", () => {
  const html = renderToStaticMarkup(React.createElement(HeroSection));
  assert.match(html, /Ship internal software/);
  assert.match(html, /href="#self-host"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("HeroSection hides the decorative product visual from assistive tech and invents no quorum claim", () => {
  const html = renderToStaticMarkup(React.createElement(HeroSection));
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /\d+ of \d+ approvals/);
});

test("SurfacesSection renders every product surface", () => {
  const html = renderToStaticMarkup(React.createElement(SurfacesSection));
  assert.match(html, /id="surfaces"/);
  for (const item of surfacesContent.items) assert.ok(html.includes(item.title));
});

test("LifecycleSection renders every step", () => {
  const html = renderToStaticMarkup(React.createElement(LifecycleSection));
  assert.match(html, /id="lifecycle"/);
  for (const step of lifecycleContent.steps) assert.ok(html.includes(step.title));
});

test("GovernanceSection renders every control", () => {
  const html = renderToStaticMarkup(React.createElement(GovernanceSection));
  assert.match(html, /id="governance"/);
  for (const item of governanceContent.items) assert.ok(html.includes(item.title));
});

test("SelfHostSection renders the quick start command", () => {
  const html = renderToStaticMarkup(React.createElement(SelfHostSection));
  assert.match(html, /id="self-host"/);
  assert.ok(html.includes(selfHostContent.command));
});
