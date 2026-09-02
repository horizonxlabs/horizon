import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";

// layout.tsx imports "./globals.css" for its Next.js-bundled side effect (Node's loader has no
// `.css` handler) and calls `next/font/google`'s `Inter(...)` (whose CJS module hits the same
// tsx/esbuild static-import limitation documented at the top of landing-web-render-smoke — the
// real Next.js build resolves it, tsx's runner does not). Importing the real `layout.tsx` module
// here — rather than re-implementing `generateMetadata` in a test double — needs the same
// shim-a-loader-hook approach that suite already uses for next/image.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css") || specifier === "next/font/google") {
      return { url: `stub:${specifier}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "stub:next/font/google") {
      return {
        format: "module",
        source: `export function Inter() { return { variable: "mock-inter-variable" }; }`,
        shortCircuit: true
      };
    }
    if (url.startsWith("stub:")) {
      return { format: "module", source: "export {};", shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");

const base = "../../apps/landing-web/src";
const { LOCALES, DEFAULT_LOCALE, isLocale } = await import(`${base}/shared/locale.ts`);
const { LanguageSwitcher } = await import(`${base}/shared/language-switcher.tsx`);
const { languageSwitcherContent } = await import(`${base}/shared/language-switcher-content.ts`);
const { metadataContent } = await import(`${base}/shared/metadata-content.ts`);
const { generateMetadata } = await import(`${base}/app/[lang]/layout.tsx`);
const sitemapModule = await import(`${base}/app/sitemap.ts`);

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

test("the sitemap lists both locales, each cross-referencing every locale via alternates.languages", () => {
  const entries = sitemapModule.default();
  const paths = entries.map((entry) => new URL(entry.url).pathname);
  for (const locale of LOCALES) {
    assert.ok(paths.includes(`/${locale}`), `sitemap is missing /${locale}`);
  }
  for (const entry of entries) {
    const languages = entry.alternates?.languages;
    assert.ok(languages, `${entry.url}: missing alternates.languages`);
    for (const locale of LOCALES) {
      assert.ok(
        languages[locale]?.endsWith(`/${locale}`),
        `${entry.url}: alternates.languages is missing a ${locale} entry`
      );
    }
  }
});

test("per-locale metadata declares hreflang alternates for every locale, with titles that genuinely differ", async () => {
  const titles = new Set();
  for (const locale of LOCALES) {
    const meta = await generateMetadata({ params: Promise.resolve({ lang: locale }) });
    const languages = meta.alternates?.languages;
    assert.ok(languages, `${locale}: metadata declares no alternates.languages`);
    for (const target of LOCALES) {
      assert.equal(
        languages[target],
        `/${target}`,
        `${locale}: alternates.languages is missing a ${target} entry`
      );
    }
    assert.equal(meta.openGraph?.locale, locale === "th" ? "th_TH" : "en_US");
    titles.add(meta.title);
  }
  assert.equal(titles.size, LOCALES.length, "titles must genuinely differ across locales");
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

const { siteConfig } = await import(`${base}/shared/site-config.ts`);

test("nav items are translated for both locales, with matching hrefs in the same order", () => {
  const { th, en } = siteConfig.navItems;
  assert.ok(th.length > 0, "th nav items are empty");
  assert.equal(th.length, en.length, "th and en nav items have different lengths");
  for (let i = 0; i < th.length; i += 1) {
    assert.equal(th[i].href, en[i].href, `nav item ${i}: hrefs must match across locales`);
    assert.match(th[i].label, THAI, `nav item ${i} (th): label contains no Thai script`);
    assert.doesNotMatch(en[i].label, THAI, `nav item ${i} (en): label contains Thai script`);
  }
});

test("the language switcher links to every other locale and marks the current one, for every locale", () => {
  for (const locale of LOCALES) {
    const html = renderToStaticMarkup(React.createElement(LanguageSwitcher, { locale }));
    assert.match(
      html,
      new RegExp(`aria-current="true"[^>]*>${languageSwitcherContent[locale].label}<`),
      `${locale}: current locale is not marked with aria-current`
    );
    for (const target of LOCALES) {
      if (target === locale) {
        assert.doesNotMatch(
          html,
          new RegExp(`href="/${target}"`),
          `${locale}: must not link to itself`
        );
      } else {
        assert.match(
          html,
          new RegExp(`href="/${target}"`),
          `${locale}: missing a link to /${target}`
        );
      }
    }
  }
});

// Enumerated from disk rather than hand-listed: a hardcoded literal here is exactly why the
// same class of gap (a locale module missing from this map, so it skipped every completeness,
// Thai-script, and honesty guard below) was found three review rounds running — first
// siteConfig.navItems, then the switcher/metadata modules, then footerCopy. Reading the
// directory means a new features/* module is covered automatically; forgetting to register it
// is no longer possible because there is nothing left to register.
const featuresRoot = "apps/landing-web/src/features";
const featureNames = readdirSync(featuresRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
assert.ok(
  featureNames.length > 0,
  `${featuresRoot} enumeration found zero directories — the read is broken, not just empty`
);

const modules = {};
for (const name of featureNames) {
  modules[name] = await import(`${base}/features/${name}`);
}
// language-switcher-content.ts and metadata-content.ts are locale-keyed chrome content that
// lives in shared/, not features/, because they are cross-cutting (every page/section uses
// them) rather than a page section of their own — the disk enumeration above cannot see them,
// so they are added explicitly rather than silently dropped from coverage.
modules.languageSwitcher = { languageSwitcherContent };
modules.metadata = { metadataContent };

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

// Narrow, claim-shaped patterns rather than bare vocabulary. A bare `/licen[sc]e/i` or an
// `อนุมัติ` ban would false-positive on legitimate copy: the Admin Console surface description
// accurately says it governs "licenses" (apps/admin-web/src/features/observability-licensing is
// a real feature; README.md:25 and :38 use the same word), and the App Store PWA audience is
// accurately described as "approved end users" (ผู้ใช้ที่ได้รับอนุมัติ). These guards target the
// *claim shapes* that would actually be dishonest — "this repository is licensed under X" and
// "a release requires a person's approval" — not the presence of the words themselves.
const LICENCE_CLAIM =
  /licen[sc]ed under|under the [^.]{0,30}licen[sc]e|\b(MIT|Apache|GPL|BSD|MPL)\b[^.]{0,40}licen[sc]e/i;
const APPROVAL_GATE_CLAIM = /\d+ of \d+ approvals/;
const THAI_LICENCE_CLAIM =
  /ภายใต้[^.]{0,30}(ใบอนุญาต|สัญญาอนุญาต)|(ใบอนุญาต|สัญญาอนุญาต)[^.]{0,10}(MIT|Apache|GPL|BSD|MPL)/;
const THAI_APPROVAL_GATE_CLAIM = /ต้องได้รับการอนุมัติ|ขั้นตอนการอนุมัติ/;

test("neither language claims a licence or an approval gate", () => {
  for (const mod of Object.values(modules)) {
    const all = JSON.stringify(copyOf(mod));
    assert.doesNotMatch(all, LICENCE_CLAIM);
    assert.doesNotMatch(all, APPROVAL_GATE_CLAIM);
    assert.doesNotMatch(all, THAI_LICENCE_CLAIM);
    assert.doesNotMatch(all, THAI_APPROVAL_GATE_CLAIM);
  }
});

// Proof the guards above actually discriminate, in both directions, per the fix-round review:
// "a guard that only passes is not evidence". Each guard must both catch a constructed false
// claim and leave the real, legitimate copy alone.
test("the licence-claim and approval-gate guards catch false claims without flagging real copy", () => {
  // English licence claim: must fire on a constructed false statement...
  assert.ok(LICENCE_CLAIM.test("Horizon is released under the MIT License."));
  // ...and must not fire on the real, accurate Admin Console copy.
  assert.ok(
    !LICENCE_CLAIM.test(
      "Govern providers, access, policies, operations, and licenses for release readiness."
    )
  );

  // Thai licence claim: must fire on a constructed false statement...
  assert.ok(THAI_LICENCE_CLAIM.test("Horizon เผยแพร่ภายใต้ใบอนุญาต MIT"));
  // ...and must not fire on the real, accurate Thai Admin Console copy.
  assert.ok(
    !THAI_LICENCE_CLAIM.test(
      "ควบคุมผู้ให้บริการ AI สิทธิ์การเข้าถึง นโยบาย การดำเนินงาน และใบอนุญาต เพื่อความพร้อมก่อนเผยแพร่"
    )
  );

  // Thai approval-gate claim: must fire on a constructed false statement...
  assert.ok(
    THAI_APPROVAL_GATE_CLAIM.test("การเผยแพร่แอปทุกครั้งต้องได้รับการอนุมัติจากผู้ดูแลระบบ")
  );
  // ...and must not fire on the real, accurate "approved end users" audience copy, or the real
  // FAQ copy describing already-approved AI providers — neither is a release-approval-gate claim.
  assert.ok(!THAI_APPROVAL_GATE_CLAIM.test("พนักงานและผู้ใช้ที่ได้รับอนุมัติ"));
  assert.ok(
    !THAI_APPROVAL_GATE_CLAIM.test(
      "ทำให้ Horizon เรียกใช้โมเดลที่องค์กรของคุณอนุมัติไว้แล้ว แทนที่จะผูกติดกับผู้ให้บริการรายใดรายหนึ่งตายตัว"
    )
  );
});
