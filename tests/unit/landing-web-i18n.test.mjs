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
