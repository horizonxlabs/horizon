import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// `next/image`'s CJS module (packages/next/dist/shared/lib/image-external.js) hints its named
// exports to tooling via the `0 && (module.exports = { default: null, ... })` dead-code pattern
// that Node's own cjs-module-lexer understands, but tsx's esbuild-based *static* import
// transform does not — a static `import Image from "next/image"` here resolves to the raw
// `{ default, getImageProps }` wrapper object rather than the real component, even though the
// real Next.js build (SWC/webpack, which authored that hint) resolves it correctly. This is a
// test-tooling limitation, not an app bug: verified by comparing `import Image from "next/image"`
// (broken here) against `(await import("next/image")).default` (correctly unwraps) under this
// same tsx runner. Shim it for this test file only so SiteNav's real render logic — nav items,
// hrefs, labels — still gets genuine render-smoke coverage.
const NEXT_IMAGE_SHIM_URL = new URL("./__next-image-test-shim__.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") {
      return { url: NEXT_IMAGE_SHIM_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === NEXT_IMAGE_SHIM_URL) {
      return {
        format: "module",
        source: `
          import { createElement } from "react";
          export default function Image({ src, alt, width, height, className }) {
            return createElement("img", { src, alt, width, height, className });
          }
          export function getImageProps() { return {}; }
        `,
        shortCircuit: true
      };
    }
    return nextLoad(url, context);
  }
});

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
  for (const locale of ["th", "en"]) {
    assert.ok(siteConfig.navItems[locale].length > 0);
  }
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
      assert.doesNotMatch(
        source,
        /^\s*["']use client["']/m,
        `${root}/${entry} is a client component`
      );
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
  const html = renderToStaticMarkup(React.createElement(SiteNav, { locale: "en" }));
  for (const item of siteConfig.navItems.en) {
    assert.match(html, new RegExp(`href="${item.href}"`));
    assert.match(html, new RegExp(item.label));
  }
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("SiteNav renders the logo lockup with meaningful alt text", () => {
  const html = renderToStaticMarkup(React.createElement(SiteNav, { locale: "en" }));
  assert.match(html, /src="\/horizon-logo\.png"/);
  assert.match(html, new RegExp(`alt="${siteConfig.name}`));
});

test("SiteFooter states the project name without claiming a licence, in both locales", () => {
  for (const locale of ["th", "en"]) {
    const html = renderToStaticMarkup(React.createElement(SiteFooter, { locale }));
    assert.match(html, /Horizon/);
    assert.doesNotMatch(html, /licen[sc]e/i);
  }
});

const { HeroSection } = await import(`${base}/features/hero`);
const { SurfacesSection, surfacesContent } = await import(`${base}/features/surfaces`);
const { LifecycleSection, lifecycleContent } = await import(`${base}/features/lifecycle`);
const { GovernanceSection, governanceContent } = await import(`${base}/features/governance`);
const { SelfHostSection, selfHostContent } = await import(`${base}/features/self-host`);
const { OpenSourceSection } = await import(`${base}/features/open-source`);
const { FaqSection, faqContent } = await import(`${base}/features/faq`);
const { FinalCtaSection, finalCtaContent } = await import(`${base}/features/final-cta`);

test("HeroSection renders the headline and both actions", () => {
  const html = renderToStaticMarkup(React.createElement(HeroSection, { locale: "en" }));
  assert.match(html, /Ship internal software/);
  assert.match(html, /href="#self-host"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("HeroSection hides the decorative product visual from assistive tech and invents no quorum claim", () => {
  const html = renderToStaticMarkup(React.createElement(HeroSection, { locale: "en" }));
  assert.match(html, /aria-hidden="true"/);
  // Guards against a false quorum claim (e.g. "3 of 4 approvals") that an earlier draft of the
  // hero product visual invented and this branch removed — a fabricated governance number with
  // no backing data. Keep this even though the current copy has nothing to trip it.
  assert.doesNotMatch(html, /\d+ of \d+ approvals/);
});

test("SurfacesSection renders every product surface", () => {
  const html = renderToStaticMarkup(React.createElement(SurfacesSection, { locale: "en" }));
  assert.match(html, /id="surfaces"/);
  for (const item of surfacesContent.en.items) assert.ok(html.includes(item.title));
});

test("LifecycleSection renders every step", () => {
  const html = renderToStaticMarkup(React.createElement(LifecycleSection, { locale: "en" }));
  assert.match(html, /id="lifecycle"/);
  for (const step of lifecycleContent.en.steps) assert.ok(html.includes(step.title));
});

test("GovernanceSection renders every control", () => {
  const html = renderToStaticMarkup(React.createElement(GovernanceSection, { locale: "en" }));
  assert.match(html, /id="governance"/);
  for (const item of governanceContent.en.items) assert.ok(html.includes(item.title));
});

test("SelfHostSection renders the quick start command", () => {
  const html = renderToStaticMarkup(React.createElement(SelfHostSection, { locale: "en" }));
  assert.match(html, /id="self-host"/);
  assert.ok(html.includes(selfHostContent.en.command));
});

test("OpenSourceSection renders the repository link", () => {
  const html = renderToStaticMarkup(React.createElement(OpenSourceSection, { locale: "en" }));
  assert.match(html, /id="open-source"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("FaqSection renders every question", () => {
  const html = renderToStaticMarkup(React.createElement(FaqSection, { locale: "en" }));
  assert.match(html, /id="faq"/);
  for (const entry of faqContent.en.entries) assert.ok(html.includes(entry.question));
});

test("FinalCtaSection repeats both hero actions", () => {
  const html = renderToStaticMarkup(React.createElement(FinalCtaSection, { locale: "en" }));
  assert.match(html, /href="#self-host"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

const LandingPage = (await import(`${base}/app/[lang]/page.tsx`)).default;

// The page component itself must await `params` (this Next.js version's route contract), so
// unlike the section components above it cannot be rendered via `React.createElement` — call it
// directly to resolve the element tree first, then hand that (fully synchronous) tree to
// `renderToStaticMarkup`.
async function renderLandingPage(lang = "en") {
  const element = await LandingPage({ params: Promise.resolve({ lang }) });
  return renderToStaticMarkup(element);
}

test("the page renders every section in order", async () => {
  const html = await renderLandingPage();
  const order = [
    'id="top"',
    'id="surfaces"',
    'id="lifecycle"',
    'id="governance"',
    'id="self-host"',
    'id="open-source"',
    'id="faq"',
    finalCtaContent.en.headline
  ];
  let cursor = -1;
  for (const anchor of order) {
    const next = html.indexOf(anchor);
    assert.ok(next > cursor, `${anchor} is missing or out of order`);
    cursor = next;
  }
});

test("every navigation anchor resolves to a section the page renders", async () => {
  const html = await renderLandingPage();
  for (const item of siteConfig.navItems.en) {
    assert.match(html, new RegExp(`id="${item.href.slice(1)}"`), `no section for ${item.href}`);
  }
});
