import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = "apps/platform-api/keycloak/themes/horizon/login";

function cssRule(css, selector) {
  const selectorIndex = css.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `Missing CSS selector: ${selector}`);

  const openingBrace = css.indexOf("{", selectorIndex);
  assert.notEqual(openingBrace, -1, `Missing opening brace for: ${selector}`);

  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(selectorIndex, index + 1);
  }

  assert.fail(`Unbalanced CSS block for: ${selector}`);
}

function cssBlock(css, selector) {
  const rule = cssRule(css, selector);
  return rule.slice(rule.indexOf("{") + 1, -1);
}

function withoutWhere(selector) {
  let result = selector;
  let whereIndex = result.indexOf(":where(");

  while (whereIndex !== -1) {
    let depth = 1;
    let endIndex = result.indexOf("(", whereIndex) + 1;
    for (; endIndex < result.length; endIndex += 1) {
      if (result[endIndex] === "(") depth += 1;
      if (result[endIndex] === ")") depth -= 1;
      if (depth === 0) break;
    }
    result = `${result.slice(0, whereIndex)}${result.slice(endIndex + 1)}`;
    whereIndex = result.indexOf(":where(");
  }

  return result;
}

function selectorSpecificity(selector) {
  const normalized = withoutWhere(selector).replaceAll(":is(", "(");
  const idCount = (normalized.match(/#[\w-]+/g) ?? []).length;
  const classCount = (normalized.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const elementCount = (
    normalized
      .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-]+/g, " ")
      .match(/\b[a-z][\w-]*\b/gi) ?? []
  ).length;

  return idCount * 100 + classCount * 10 + elementCount;
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
  const primaryButtonStyles = cssBlock(
    css,
    ".horizon-auth-panel .pf-v5-c-button.pf-m-primary,"
  );
  const secondaryButtonRule = cssRule(
    css,
    ".horizon-auth-panel .pf-v5-c-button.pf-m-secondary,"
  );
  const authenticatorSelectionStyles = cssBlock(
    css,
    ".horizon-auth-panel .select-auth-box-parent"
  );
  const standaloneControlSelector =
    '.horizon-auth-panel :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea)';
  const standaloneControlStyles = cssBlock(css, standaloneControlSelector);
  const standaloneHoverStyles = cssBlock(
    css,
    ".horizon-auth-panel :where(input:hover, select:hover, textarea:hover),"
  );
  const standaloneFocusStyles = cssBlock(
    css,
    ".horizon-auth-panel :where(input:focus, select:focus, textarea:focus),"
  );
  const wrapperFocusStyles = cssBlock(
    css,
    ".horizon-auth-panel .pf-v5-c-form-control:focus-within,"
  );
  const nestedInteractionStyles = cssBlock(
    css,
    ".horizon-auth-panel .pf-v5-c-form-control > :is(input, select, textarea):is(:hover, :focus, :focus-visible),"
  );
  const nestedAutofillStyles = cssBlock(
    css,
    ".horizon-auth-panel .pf-v5-c-form-control > :is(input, select, textarea):-webkit-autofill,"
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
  for (const state of ["", ":hover", ":focus", ":focus-visible"]) {
    assert.ok(
      selectorSpecificity(`.horizon-auth-panel .pf-v5-c-form-control > input${state}`) >
        selectorSpecificity(`.horizon-auth-panel :where(input${state})`),
      `wrapped controls must outrank standalone ${state || "normal"} styling`
    );
  }
  assert.match(standaloneControlStyles, /border:\s*1px solid #cbd5e1/);
  assert.match(standaloneHoverStyles, /border-color:\s*#94a3b8/);
  assert.match(standaloneFocusStyles, /box-shadow:\s*0 0 0 3px/);
  assert.match(wrapperFocusStyles, /box-shadow:\s*0 0 0 3px/);
  assert.match(nestedInteractionStyles, /border:\s*0/);
  assert.match(nestedInteractionStyles, /background:\s*transparent/);
  assert.match(nestedInteractionStyles, /box-shadow:\s*none/);
  assert.match(nestedInteractionStyles, /outline:\s*0/);
  assert.match(nestedAutofillStyles, /border:\s*0/);
  assert.match(nestedAutofillStyles, /background:\s*transparent/);
  assert.match(nestedAutofillStyles, /-webkit-box-shadow:\s*none/);

  assert.match(primaryButtonStyles, /width:\s*100%/);
  assert.match(primaryButtonStyles, /background:\s*var\(--horizon-primary\)/);
  assert.doesNotMatch(
    css,
    /\.horizon-auth-panel\s+(?:input|button)\[type="submit"\](?::(?:hover|active))?/
  );
  assert.match(secondaryButtonRule, /#kc-decline/);
  assert.match(secondaryButtonRule, /button\[name="cancel-aia"\]/);
  assert.match(authenticatorSelectionStyles, /cursor:\s*pointer/);
  assert.match(authenticatorSelectionStyles, /border-top:\s*1px solid var\(--horizon-border\)/);
  assert.match(authenticatorSelectionStyles, /background:\s*transparent/);
  assert.doesNotMatch(authenticatorSelectionStyles, /width:\s*100%/);

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
