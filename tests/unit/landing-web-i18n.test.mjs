import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const base = "../../apps/landing-web/src";
const { LOCALES, DEFAULT_LOCALE, isLocale } = await import(`${base}/shared/locale.ts`);

test("Thai is the default locale and both locales are supported", () => {
  assert.deepEqual([...LOCALES].sort(), ["en", "th"]);
  assert.equal(DEFAULT_LOCALE, "th");
  assert.ok(isLocale("th") && isLocale("en"));
  assert.ok(!isLocale("fr"));
});

test("the route tree is locale-segmented", () => {
  for (const file of ["layout.tsx", "page.tsx", "globals.css"]) {
    assert.ok(
      existsSync(`apps/landing-web/src/app/[lang]/${file}`),
      `app/[lang]/${file} is missing`
    );
  }
  assert.ok(!existsSync("apps/landing-web/src/app/page.tsx"), "the un-segmented page must be gone");
});

// sitemap.ts and robots.ts stay at the app root rather than under [lang]: per
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/{sitemap,robots}.md
// both conventions require placement "in the root of app directory". Nesting them under a
// dynamic segment breaks them silently — robots.ts produced no route at all, and sitemap.ts
// built to a stray `/-/sitemap.xml` path instead of a working `/sitemap.xml` — verified by an
// actual `next build` plus curl against the served output (see task-2-report.md).
test("sitemap and robots stay unlocalized at the app root, not under [lang]", () => {
  assert.ok(existsSync("apps/landing-web/src/app/sitemap.ts"));
  assert.ok(existsSync("apps/landing-web/src/app/robots.ts"));
  assert.ok(!existsSync("apps/landing-web/src/app/[lang]/sitemap.ts"));
  assert.ok(!existsSync("apps/landing-web/src/app/[lang]/robots.ts"));
});

test("both locales are prerendered", () => {
  const layout = readFileSync("apps/landing-web/src/app/[lang]/layout.tsx", "utf8");
  assert.match(layout, /generateStaticParams/);
  for (const locale of LOCALES)
    assert.ok(layout.includes(`"${locale}"`) || layout.includes(`'${locale}'`));
});

test("the bare root redirects to the default locale", () => {
  const proxy = readFileSync("apps/landing-web/src/proxy.ts", "utf8");
  assert.match(proxy, /\/th/);
  assert.match(proxy, /redirect/i);
});

const THAI = /[฀-๿]/;

const modules = {
  hero: await import(`${base}/features/hero`),
  surfaces: await import(`${base}/features/surfaces`),
  lifecycle: await import(`${base}/features/lifecycle`),
  governance: await import(`${base}/features/governance`),
  selfHost: await import(`${base}/features/self-host`),
  openSource: await import(`${base}/features/open-source`),
  faq: await import(`${base}/features/faq`),
  finalCta: await import(`${base}/features/final-cta`)
};

function copyOf(mod) {
  return Object.entries(mod).find(([name]) => name.endsWith("Content"))?.[1];
}

test("every section provides copy for both locales", () => {
  for (const [name, mod] of Object.entries(modules)) {
    const content = copyOf(mod);
    assert.ok(content, `${name} exports no *Content`);
    for (const locale of LOCALES) {
      assert.ok(content[locale], `${name} is missing ${locale} copy`);
    }
    assert.deepEqual(
      Object.keys(content.th).sort(),
      Object.keys(content.en).sort(),
      `${name}: the two locales have different shapes`
    );
  }
});

test("Thai copy is Thai and English copy is not", () => {
  for (const [name, mod] of Object.entries(modules)) {
    const content = copyOf(mod);
    assert.match(JSON.stringify(content.th), THAI, `${name}: th copy contains no Thai script`);
    assert.doesNotMatch(JSON.stringify(content.en), THAI, `${name}: en copy contains Thai script`);
  }
});

test("neither language claims a licence or an approval gate", () => {
  for (const mod of Object.values(modules)) {
    const all = JSON.stringify(copyOf(mod));
    assert.doesNotMatch(all, /licen[sc]e/i);
    assert.doesNotMatch(all, /\d+ of \d+ approvals/);
  }
});
