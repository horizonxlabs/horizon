import test from "node:test";
import assert from "node:assert/strict";

const base = "../../apps/landing-web/src";
const { heroContent } = await import(`${base}/features/hero/hero-content.ts`);
const { surfacesContent } = await import(`${base}/features/surfaces/surfaces-content.ts`);
const { lifecycleContent } = await import(`${base}/features/lifecycle/lifecycle-content.ts`);
const { governanceContent } = await import(`${base}/features/governance/governance-content.ts`);
const { selfHostContent } = await import(`${base}/features/self-host/self-host-content.ts`);
const { faqContent } = await import(`${base}/features/faq/faq-content.ts`);
const { openSourceContent } = await import(`${base}/features/open-source/open-source-content.ts`);
const { finalCtaContent } = await import(`${base}/features/final-cta/final-cta-content.ts`);

const LOCALES = ["th", "en"];

test("hero copy is present for both locales", () => {
  // Thai-script presence/absence is asserted per locale in landing-web-i18n.test.mjs — this
  // file keeps the content-shape invariants (non-empty copy, correct interactive elements).
  for (const locale of LOCALES) {
    assert.ok(heroContent[locale].headline.length > 0);
    assert.ok(heroContent[locale].subhead.length > 0);
  }
});

test("hero offers a primary anchor and an external repository action", () => {
  for (const locale of LOCALES) {
    const { actions } = heroContent[locale];
    assert.equal(actions.length, 2);
    assert.ok(actions[0].href.startsWith("#"));
    assert.equal(actions[1].external, true);
    assert.ok(actions[1].href.startsWith("https://"));
  }
});

test("the three product surfaces match repository README", () => {
  for (const locale of LOCALES) {
    assert.deepEqual(
      surfacesContent[locale].items.map((item) => item.title),
      ["Admin Console", "Creator App", "App Store PWA"]
    );
    for (const item of surfacesContent[locale].items) {
      assert.ok(item.audience.length > 0);
      assert.ok(item.description.length > 0);
    }
  }
});

test("the lifecycle runs idea to publish in five steps", () => {
  for (const locale of LOCALES) {
    assert.equal(lifecycleContent[locale].steps.length, 5);
  }
  assert.equal(lifecycleContent.en.steps.at(-1).title, "Publish");
});

test("governance covers controls the platform actually implements", () => {
  for (const locale of LOCALES) {
    assert.equal(governanceContent[locale].items.length, 6);
  }
  const titles = governanceContent.en.items.map((item) => item.title).join(" ");
  for (const expected of ["Provider key protection", "Isolation by default", "Single sign-on"]) {
    assert.ok(titles.includes(expected), `missing ${expected}`);
  }
});

test("self-host quotes the real quick start command in both locales", () => {
  for (const locale of LOCALES) {
    assert.equal(selfHostContent[locale].command, "pnpm dev:setup");
    assert.ok(selfHostContent[locale].services.includes("Postgres"));
  }
});

test("every product surface appears in the self-host service list, in both locales", () => {
  for (const locale of LOCALES) {
    for (const surface of surfacesContent[locale].items) {
      assert.ok(
        selfHostContent[locale].services.includes(surface.title),
        `${surface.title} is described as a surface but missing from the self-host stack (${locale})`
      );
    }
  }
});

test("the FAQ answers four questions and claims no licence, in both locales", () => {
  for (const locale of LOCALES) {
    assert.equal(faqContent[locale].entries.length, 4);
    const all = faqContent[locale].entries.map((e) => `${e.question} ${e.answer}`).join(" ");
    assert.doesNotMatch(all, /licen[sc]e/i, "the repository has no LICENSE file yet");
  }
});

test("the open source section links to the repository, in both locales", () => {
  for (const locale of LOCALES) {
    assert.ok(openSourceContent[locale].action.href.startsWith("https://github.com/"));
    assert.equal(openSourceContent[locale].action.external, true);
  }
});

test("final CTA copy is present for both locales", () => {
  for (const locale of LOCALES) {
    assert.ok(finalCtaContent[locale].headline.length > 0);
    assert.ok(finalCtaContent[locale].paragraph.length > 0);
  }
});
