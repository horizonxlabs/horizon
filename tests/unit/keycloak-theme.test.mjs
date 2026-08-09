import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = "apps/platform-api/keycloak/themes/horizon/login";

function cssBlock(css, selector) {
  const selectorIndex = css.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `Missing CSS selector: ${selector}`);

  const openingBrace = css.indexOf("{", selectorIndex);
  assert.notEqual(openingBrace, -1, `Missing opening brace for: ${selector}`);

  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(openingBrace + 1, index);
  }

  assert.fail(`Unbalanced CSS block for: ${selector}`);
}

test("Horizon is a self-contained English Keycloak v2 login theme", async () => {
  const [properties, template, messages] = await Promise.all([
    readFile(`${root}/theme.properties`, "utf8"),
    readFile(`${root}/template.ftl`, "utf8"),
    readFile(`${root}/messages/messages_en.properties`, "utf8")
  ]);

  assert.match(properties, /^parent=keycloak\.v2$/m);
  assert.match(properties, /^locales=en$/m);
  assert.match(properties, /^styles=css\/horizon-login\.css$/m);
  assert.match(template, /horizon-auth-shell/);
  assert.match(template, /horizon-brand-panel/);
  assert.match(template, /<#nested "header">/);
  assert.match(template, /<#nested "form">/);
  assert.match(template, /kcSanitize\(message\.summary\)/);
  assert.match(
    template,
    /<select\s+aria-label="\$\{msg\("languages"\)\}"\s+id="login-select-toggle"\s+onchange="if \(this\.value\) window\.location\.href=this\.value"\s*>/
  );
  assert.match(messages, /^loginTitle=Sign in to Horizon$/m);

  await Promise.all([
    access(`${root}/resources/img/horizon-logo.png`),
    access(`${root}/resources/img/favicon.svg`),
    access(`${root}/resources/fonts/LINESeedSansTH_W_Rg.woff2`),
    access(`${root}/resources/fonts/LINESeedSansTH_W_Bd.woff2`)
  ]);
});

test("Horizon auth CSS implements Brand Split and accessible responsive states", async () => {
  const css = await readFile(`${root}/resources/css/horizon-login.css`, "utf8");
  const desktopShell = cssBlock(css, ".horizon-auth-shell");
  const mobileStyles = cssBlock(css, "@media (max-width: 767px)");
  const reducedMotionStyles = cssBlock(css, "@media (prefers-reduced-motion: reduce)");
  const formControlStyles = cssBlock(css, ".horizon-auth-panel .pf-v5-c-form-control,");
  const nestedControlStyles = cssBlock(
    css,
    ".horizon-auth-panel .pf-v5-c-form-control > :is(input, select, textarea),"
  );

  assert.match(desktopShell, /grid-template-columns:\s*1\.05fr 1fr/);
  assert.match(cssBlock(mobileStyles, ".horizon-brand-panel"), /display:\s*none/);
  assert.match(css, /:focus-visible/);
  assert.match(reducedMotionStyles, /transition:\s*none !important/);
  assert.match(css, /@font-face/);

  assert.match(formControlStyles, /--pf-v5-c-form-control--before--BorderTopWidth:\s*0/);
  assert.match(formControlStyles, /--pf-v5-c-form-control--after--BorderBottomWidth:\s*0/);
  assert.match(nestedControlStyles, /border:\s*0/);
  assert.match(nestedControlStyles, /background:\s*transparent/);
  assert.match(nestedControlStyles, /box-shadow:\s*none/);

  for (const severity of ["danger", "warning", "success", "info"]) {
    const alertStyles = cssBlock(
      css,
      `.horizon-auth-panel .pf-v5-c-alert.pf-m-${severity},`
    );

    assert.match(alertStyles, new RegExp(`--pf-v5-c-alert__title--Color:\\s*var\\(--horizon-${severity}\\)`));
    assert.match(alertStyles, new RegExp(`--pf-v5-c-alert__icon--Color:\\s*var\\(--horizon-${severity}\\)`));
  }

  assert.doesNotMatch(css, /\.horizon-auth-panel\s+\.pf-m-(?:danger|warning|success|info)\s*\{/);
});
