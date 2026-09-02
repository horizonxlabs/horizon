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
