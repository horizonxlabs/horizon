import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = "apps/platform-api/keycloak/themes/horizon/login";

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

  assert.match(css, /grid-template-columns:\s*1\.05fr 1fr/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /\.horizon-brand-panel\s*\{[^}]*display:\s*none/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.pf-m-danger/);
  assert.match(css, /@font-face/);
});
