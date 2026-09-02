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

test("hero copy is present and contains no Thai codepoints", () => {
  // This only rejects Thai script specifically (the design system's kitchen-sink primitives
  // intentionally mix in Thai copy to exercise the font stack) — it does not check for English
  // more broadly, so keep the name and the regex in sync rather than widening the claim.
  assert.ok(heroContent.headline.length > 0);
  assert.ok(heroContent.subhead.length > 0);
  assert.doesNotMatch(
    `${heroContent.headline} ${heroContent.subhead}`,
    /[฀-๿]/,
    "hero copy must not contain Thai script"
  );
});

test("hero offers a primary anchor and an external repository action", () => {
  assert.equal(heroContent.actions.length, 2);
  assert.ok(heroContent.actions[0].href.startsWith("#"));
  assert.equal(heroContent.actions[1].external, true);
  assert.ok(heroContent.actions[1].href.startsWith("https://"));
});

test("the three product surfaces match repository README", () => {
  assert.deepEqual(
    surfacesContent.items.map((item) => item.title),
    ["Admin Console", "Creator App", "App Store PWA"]
  );
  for (const item of surfacesContent.items) {
    assert.ok(item.audience.length > 0);
    assert.ok(item.description.length > 0);
  }
});

test("the lifecycle runs idea to publish in five steps", () => {
  assert.equal(lifecycleContent.steps.length, 5);
  assert.equal(lifecycleContent.steps.at(-1).title, "Publish");
});

test("governance covers controls the platform actually implements", () => {
  assert.equal(governanceContent.items.length, 6);
  const titles = governanceContent.items.map((item) => item.title).join(" ");
  for (const expected of ["Provider key protection", "Isolation by default", "Single sign-on"]) {
    assert.ok(titles.includes(expected), `missing ${expected}`);
  }
});

test("self-host quotes the real quick start command", () => {
  assert.equal(selfHostContent.command, "pnpm dev:setup");
  assert.ok(selfHostContent.services.includes("Postgres"));
});

test("every product surface appears in the self-host service list", () => {
  for (const surface of surfacesContent.items) {
    assert.ok(
      selfHostContent.services.includes(surface.title),
      `${surface.title} is described as a surface but missing from the self-host stack`
    );
  }
});

test("the FAQ answers four questions and claims no licence", () => {
  assert.equal(faqContent.entries.length, 4);
  const all = faqContent.entries.map((e) => `${e.question} ${e.answer}`).join(" ");
  assert.doesNotMatch(all, /licen[sc]e/i, "the repository has no LICENSE file yet");
});

test("the open source section links to the repository", () => {
  assert.ok(openSourceContent.action.href.startsWith("https://github.com/"));
  assert.equal(openSourceContent.action.external, true);
});

test("final CTA copy is present and contains no Thai codepoints", () => {
  assert.ok(finalCtaContent.headline.length > 0);
  assert.ok(finalCtaContent.paragraph.length > 0);
  assert.doesNotMatch(
    `${finalCtaContent.headline} ${finalCtaContent.paragraph}`,
    /[฀-๿]/,
    "final CTA copy must not contain Thai script"
  );
});
