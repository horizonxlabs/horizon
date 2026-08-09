# Horizon Keycloak Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an English Horizon Brand Split theme for every Keycloak authentication page without changing the existing OIDC and session flow.

**Architecture:** Implement a native Keycloak 26.2 child login theme that inherits `keycloak.v2`, overrides the shared page macro, and packages its own CSS, wordmark, favicon, and font. Activate it through both realm import and idempotent bootstrap, bind-mount it in development, and ship it in a signed versioned Keycloak release image.

**Tech Stack:** Keycloak 26.2 themes, FreeMarker, CSS, Docker Compose/Swarm, GitHub Actions, Node.js test runner

---

## File Map

### Theme boundary

- Create `apps/platform-api/keycloak/themes/horizon/login/theme.properties` — parent-theme and asset declarations.
- Create `apps/platform-api/keycloak/themes/horizon/login/template.ftl` — Keycloak 26.2-compatible shared authentication shell.
- Create `apps/platform-api/keycloak/themes/horizon/login/messages/messages_en.properties` — Horizon English wording.
- Create `apps/platform-api/keycloak/themes/horizon/login/resources/css/horizon-login.css` — desktop Brand Split, mobile form, state, and accessibility styling.
- Copy `apps/creator-web/public/horizon-logo.png` to `apps/platform-api/keycloak/themes/horizon/login/resources/img/horizon-logo.png` — existing Horizon wordmark.
- Copy `apps/creator-web/public/favicon.svg` to `apps/platform-api/keycloak/themes/horizon/login/resources/img/favicon.svg` — existing Horizon favicon.
- Copy `packages/ui/fonts/LINESeedSansTH_W_Rg.woff2` and `LINESeedSansTH_W_Bd.woff2` to the theme font directory — self-contained regular and bold weights.

### Activation and deployment boundary

- Modify `apps/platform-api/keycloak/evcp-realm.json` — select the theme on a new realm.
- Modify `apps/platform-api/keycloak/bootstrap-clients.sh` — select the theme on an existing realm.
- Modify `docker/docker-compose.yml` — mount the theme read-only for local development.
- Create `docker/keycloak.Dockerfile` — build the versioned release Keycloak image.
- Modify `docker/docker-compose.release.yml` — run the versioned Horizon Keycloak image.
- Modify `.github/workflows/release.yml` — build, validate, sign, and manifest the image.

### Verification boundary

- Create `tests/unit/keycloak-theme.test.mjs` — theme structure and shared-shell contract.
- Modify `tests/unit/keycloak-realm-config.test.mjs` — realm, bootstrap, and Compose activation contracts.
- Modify `tests/unit/keycloak-bootstrap-clients.test.mjs` — executable existing-realm reconciliation proof.
- Modify `tests/integration/release-workflow-contract.test.mjs` — release image pipeline contract.
- Modify `tests/integration/swarm-stack-contract.test.mjs` — release service image contract.
- Create `tests/live/keycloak-theme-smoke.test.mjs` — real Keycloak rendering smoke.
- Modify `package.json` — expose the live smoke command.
- Modify `README.md` — document local theme verification and Keycloak restart behavior.

---

### Task 1: Establish the Horizon theme contract

**Files:**

- Create: `tests/unit/keycloak-theme.test.mjs`
- Create: `apps/platform-api/keycloak/themes/horizon/login/theme.properties`
- Create: `apps/platform-api/keycloak/themes/horizon/login/template.ftl`
- Create: `apps/platform-api/keycloak/themes/horizon/login/messages/messages_en.properties`
- Copy: `apps/platform-api/keycloak/themes/horizon/login/resources/img/horizon-logo.png`
- Copy: `apps/platform-api/keycloak/themes/horizon/login/resources/img/favicon.svg`
- Copy: `apps/platform-api/keycloak/themes/horizon/login/resources/fonts/LINESeedSansTH_W_Rg.woff2`
- Copy: `apps/platform-api/keycloak/themes/horizon/login/resources/fonts/LINESeedSansTH_W_Bd.woff2`

- [ ] **Step 1: Write the failing theme structure test**

```js
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
  assert.match(messages, /^loginTitle=Sign in to Horizon$/m);

  await Promise.all([
    access(`${root}/resources/img/horizon-logo.png`),
    access(`${root}/resources/img/favicon.svg`),
    access(`${root}/resources/fonts/LINESeedSansTH_W_Rg.woff2`),
    access(`${root}/resources/fonts/LINESeedSansTH_W_Bd.woff2`)
  ]);
});
```

- [ ] **Step 2: Run the unit test and verify the missing theme fails**

Run:

```bash
node --test tests/unit/keycloak-theme.test.mjs
```

Expected: FAIL with `ENOENT` for `theme.properties`.

- [ ] **Step 3: Create the child-theme declaration and English message overrides**

```properties
# theme.properties
parent=keycloak.v2
import=common/keycloak
styles=css/horizon-login.css
locales=en
```

```properties
# messages/messages_en.properties
loginTitle=Sign in to Horizon
loginTitleHtml=Horizon
loginAccountTitle=Welcome back
doLogIn=Sign in
emailForgotTitle=Reset your password
updatePasswordTitle=Create a new password
errorTitle=We couldn't continue
backToLogin=Back to sign in
proceedWithAction=Continue
```

- [ ] **Step 4: Copy the approved Horizon assets into the self-contained theme**

```bash
mkdir -p apps/platform-api/keycloak/themes/horizon/login/resources/img
mkdir -p apps/platform-api/keycloak/themes/horizon/login/resources/fonts
cp apps/creator-web/public/horizon-logo.png apps/platform-api/keycloak/themes/horizon/login/resources/img/horizon-logo.png
cp apps/creator-web/public/favicon.svg apps/platform-api/keycloak/themes/horizon/login/resources/img/favicon.svg
cp packages/ui/fonts/LINESeedSansTH_W_Rg.woff2 apps/platform-api/keycloak/themes/horizon/login/resources/fonts/LINESeedSansTH_W_Rg.woff2
cp packages/ui/fonts/LINESeedSansTH_W_Bd.woff2 apps/platform-api/keycloak/themes/horizon/login/resources/fonts/LINESeedSansTH_W_Bd.woff2
```

- [ ] **Step 5: Create `template.ftl` from the pinned Keycloak 26.2 `keycloak.v2` macro**

Preserve the upstream `<@registrationLayout>` macro contract, all `<#nested ...>` slots, message sanitization, password-visibility scripts, auth-session polling, username reset behavior, social-provider content, and footer content. Replace only the visible outer shell with this semantic structure:

```ftl
<body id="keycloak-bg" class="${properties.kcBodyClass!}" data-page-id="login-${pageId}">
  <div class="horizon-auth-shell">
    <aside class="horizon-brand-panel" aria-label="Horizon">
      <img src="${url.resourcesPath}/img/horizon-logo.png" alt="Horizon" class="horizon-wordmark">
      <div class="horizon-brand-copy">
        <h2>Build securely.<br>Move with clarity.</h2>
        <p>One governed workspace for internal applications.</p>
      </div>
      <p class="horizon-platform-name">Enterprise Vibe Coding Platform</p>
    </aside>
    <main class="horizon-auth-panel">
      <img src="${url.resourcesPath}/img/horizon-logo.png" alt="Horizon" class="horizon-mobile-wordmark">
      <h1 id="kc-page-title"><#nested "header"></h1>
      <#-- Preserve upstream username, message, form, alternate method,
           socialProviders, info, and footer blocks here unchanged. -->
    </main>
  </div>
</body>
```

Use `${url.resourcesPath}/img/favicon.svg` in the document head. Do not add theme-owned JavaScript.

- [ ] **Step 6: Add a temporary minimal stylesheet so the declared resource exists**

Create `resources/css/horizon-login.css` with `body { margin: 0; }`. Task 2 replaces it through a separate red-green slice.

- [ ] **Step 7: Run the theme test and verify it passes**

Run:

```bash
node --test tests/unit/keycloak-theme.test.mjs
```

Expected: PASS, 1 test.

- [ ] **Step 8: Commit the theme structure**

```bash
git add tests/unit/keycloak-theme.test.mjs apps/platform-api/keycloak/themes/horizon
git commit -m "feat(auth): add Horizon Keycloak theme shell"
```

---

### Task 2: Implement Brand Split, mobile, state, and accessibility styling

**Files:**

- Modify: `tests/unit/keycloak-theme.test.mjs`
- Modify: `apps/platform-api/keycloak/themes/horizon/login/resources/css/horizon-login.css`

- [ ] **Step 1: Add a failing CSS behavior test**

```js
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
```

- [ ] **Step 2: Run the test and verify the minimal stylesheet fails**

Run:

```bash
node --test tests/unit/keycloak-theme.test.mjs
```

Expected: FAIL on the missing Brand Split grid assertion.

- [ ] **Step 3: Implement the full stylesheet**

Use the existing Horizon tokens as literal theme-local values because Keycloak cannot import the application package at runtime:

```css
@font-face {
  font-family: "LINE Seed Sans";
  src: url("../fonts/LINESeedSansTH_W_Rg.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

:root {
  --horizon-primary: #2563eb;
  --horizon-primary-strong: #1d4ed8;
  --horizon-page: #f1f5f9;
  --horizon-surface: #ffffff;
  --horizon-border: #e2e8f0;
  --horizon-text: #0f172a;
  --horizon-muted: #64748b;
}

.horizon-auth-shell {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  width: min(884px, calc(100vw - 48px));
  min-height: 590px;
  border: 1px solid var(--horizon-border);
  border-radius: 22px;
  background: var(--horizon-surface);
  box-shadow: 0 40px 90px rgba(15, 23, 42, 0.14);
}

.horizon-brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 44px 40px;
  color: #fff;
  border-radius: 21px 0 0 21px;
  background: linear-gradient(155deg, #1d4ed8 0%, #1e3a8a 60%, #0f2167 100%);
}

@media (max-width: 767px) {
  .horizon-auth-shell { display: block; width: min(100% - 32px, 424px); min-height: 0; }
  .horizon-brand-panel { display: none; }
  .horizon-mobile-wordmark { display: block; }
}

:where(input, select, button, a):focus-visible {
  outline: 3px solid var(--horizon-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
```

Complete the file by styling inherited PatternFly inputs, password visibility control, primary/secondary buttons, links, helper text, `.pf-m-danger`, success/warning/info alerts, required-action content, social-provider lists, and long error text without changing their markup or names.

- [ ] **Step 4: Run the unit test and verify all theme assertions pass**

Run:

```bash
node --test tests/unit/keycloak-theme.test.mjs
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the approved responsive styling**

```bash
git add tests/unit/keycloak-theme.test.mjs apps/platform-api/keycloak/themes/horizon/login/resources/css/horizon-login.css
git commit -m "feat(auth): style Keycloak Brand Split flow"
```

---

### Task 3: Activate the theme for clean and persisted realms

**Files:**

- Modify: `tests/unit/keycloak-realm-config.test.mjs`
- Modify: `tests/unit/keycloak-bootstrap-clients.test.mjs`
- Modify: `apps/platform-api/keycloak/evcp-realm.json`
- Modify: `apps/platform-api/keycloak/bootstrap-clients.sh`
- Modify: `docker/docker-compose.yml`

- [ ] **Step 1: Add failing realm and development deployment assertions**

Extend the first realm test:

```js
assert.equal(realm.loginTheme, "horizon");
assert.equal(realm.internationalizationEnabled, false);
assert.match(bootstrap, /update "realms\/\$KEYCLOAK_REALM" -s loginTheme=horizon/);
```

Extend the Compose test:

```js
assert.match(
  developmentCompose,
  /keycloak\/themes\/horizon:\/opt\/keycloak\/themes\/horizon:ro/
);
```

- [ ] **Step 2: Add a failing executable bootstrap assertion**

Change the fake `kcadm.sh` in the success test to append every argument list to a log file, then assert:

```js
assert.match(
  readFileSync(commandLog, "utf8"),
  /update realms\/evcp -s loginTheme=horizon/
);
```

- [ ] **Step 3: Run the targeted tests and verify they fail**

Run:

```bash
node --test tests/unit/keycloak-realm-config.test.mjs tests/unit/keycloak-bootstrap-clients.test.mjs
```

Expected: FAIL because neither realm source, bootstrap, nor Compose selects or mounts `horizon`.

- [ ] **Step 4: Activate English Horizon theming in the realm import**

Add top-level realm values:

```json
"loginTheme": "horizon",
"internationalizationEnabled": false,
```

- [ ] **Step 5: Reconcile persisted realms idempotently**

Add a dedicated update after successful admin authentication:

```sh
"$kcadm" update "realms/$KEYCLOAK_REALM" -s loginTheme=horizon
```

Keep the existing `sslRequired=none` development reconciliation as a separate update so the theme setting is explicit and testable.

- [ ] **Step 6: Mount the theme into local Keycloak**

Add to the development `keycloak.volumes` list:

```yaml
- ../apps/platform-api/keycloak/themes/horizon:/opt/keycloak/themes/horizon:ro
```

- [ ] **Step 7: Run the targeted tests and verify they pass**

Run:

```bash
node --test tests/unit/keycloak-realm-config.test.mjs tests/unit/keycloak-bootstrap-clients.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Validate the rendered development Compose configuration**

Run:

```bash
docker compose --env-file .env -f docker/docker-compose.yml config --quiet
```

Expected: exit 0.

- [ ] **Step 9: Commit realm and development activation**

```bash
git add tests/unit/keycloak-realm-config.test.mjs tests/unit/keycloak-bootstrap-clients.test.mjs apps/platform-api/keycloak/evcp-realm.json apps/platform-api/keycloak/bootstrap-clients.sh docker/docker-compose.yml
git commit -m "feat(auth): activate Horizon login theme"
```

---

### Task 4: Package and attest the release Keycloak image

**Files:**

- Modify: `tests/integration/release-workflow-contract.test.mjs`
- Modify: `tests/integration/swarm-stack-contract.test.mjs`
- Create: `docker/keycloak.Dockerfile`
- Modify: `docker/docker-compose.release.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add Keycloak to the failing release image contract**

Add Keycloak to `releaseImageServices`:

```js
const releaseImageServices = [
  ["keycloak", "evcp-keycloak"],
  ["platform-api", "evcp-platform-api"],
  ["admin-web", "evcp-admin-web"],
  ["creator-web", "evcp-creator-web"],
  ["app-store-pwa", "evcp-app-store-pwa"],
  ["workspace-next-image", "evcp-workspace-next"]
];
```

Add a build-file assertion:

```js
assert.match(stepByName("Build and push keycloak").with.file, /keycloak\.Dockerfile/);
```

Add a release-stack assertion:

```js
assert.equal(
  release.services.keycloak.image,
  "${EVCP_IMAGE_REPOSITORY:?EVCP_IMAGE_REPOSITORY is required}/evcp-keycloak:${EVCP_VERSION:?EVCP_VERSION required}"
);
```

- [ ] **Step 2: Run the release contract tests and verify they fail**

Run:

```bash
node --test tests/integration/release-workflow-contract.test.mjs tests/integration/swarm-stack-contract.test.mjs
```

Expected: FAIL because release Compose still references the upstream Keycloak image and no build step exists.

- [ ] **Step 3: Create the minimal pinned Keycloak image**

```dockerfile
FROM quay.io/keycloak/keycloak:26.2

LABEL org.opencontainers.image.title="Horizon Keycloak"
COPY --chown=keycloak:keycloak apps/platform-api/keycloak/themes/horizon /opt/keycloak/themes/horizon
```

- [ ] **Step 4: Point release Compose at the versioned Horizon image**

Replace only `services.keycloak.image`:

```yaml
image: ${EVCP_IMAGE_REPOSITORY:?EVCP_IMAGE_REPOSITORY is required}/evcp-keycloak:${EVCP_VERSION:?EVCP_VERSION required}
```

Keep the existing production entrypoint, command, database, secret, health-check, network, placement, and restart settings unchanged.

- [ ] **Step 5: Build and push Keycloak in the release workflow**

Insert before the platform API build:

```yaml
- name: Build and push keycloak
  id: keycloak
  uses: docker/build-push-action@v7
  with:
    context: .
    file: docker/keycloak.Dockerfile
    push: true
    labels: |
      org.opencontainers.image.source=https://github.com/${{ github.repository }}
      org.opencontainers.image.version=${{ steps.release.outputs.version }}
      org.opencontainers.image.revision=${{ github.sha }}
    tags: |
      ${{ steps.release.outputs.image_repository }}/evcp-keycloak:${{ steps.release.outputs.version }}
      ${{ steps.release.outputs.image_repository }}/evcp-keycloak:${{ github.sha }}
```

Add the image coordinate to Compose validation, `KEYCLOAK_DIGEST` to signing and asset environments, a `cosign sign` call, and this manifest object:

```json
"keycloak": {
  "tag": "${IMAGE_REPOSITORY}/evcp-keycloak:${VERSION}",
  "digest": "${KEYCLOAK_DIGEST}"
}
```

- [ ] **Step 6: Run release contract tests and verify they pass**

Run:

```bash
node --test tests/integration/release-workflow-contract.test.mjs tests/integration/swarm-stack-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Build the release image locally and verify theme files exist**

Run:

```bash
docker build -f docker/keycloak.Dockerfile -t evcp-keycloak-theme-check .
docker run --rm --entrypoint sh evcp-keycloak-theme-check -lc 'test -f /opt/keycloak/themes/horizon/login/template.ftl && test -f /opt/keycloak/themes/horizon/login/resources/css/horizon-login.css'
```

Expected: image build and file checks exit 0.

- [ ] **Step 8: Commit release packaging**

```bash
git add tests/integration/release-workflow-contract.test.mjs tests/integration/swarm-stack-contract.test.mjs docker/keycloak.Dockerfile docker/docker-compose.release.yml .github/workflows/release.yml
git commit -m "build(auth): ship versioned Horizon Keycloak image"
```

---

### Task 5: Prove the real Keycloak login and error pages render safely

**Files:**

- Create: `tests/live/keycloak-theme-smoke.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the live rendering smoke test**

The test must:

1. Build `docker/keycloak.Dockerfile` with a process-unique local tag.
2. Start a process-unique Keycloak container with an automatically assigned host port.
3. Read the repository realm import read-only.
4. Wait for `/auth/realms/evcp` to return HTTP 200.
5. Request the authorization endpoint for `evcp-platform-api` and assert:
   - HTTP 200
   - `class="horizon-auth-shell"`
   - `Build securely.`
   - `action=` containing `/login-actions/authenticate`
   - `/resources/` references `horizon-login.css`
6. Request the same realm with an unknown client and assert the Horizon shell and a user-safe error message render.
7. Remove only the process-unique container and image in `test.after`.

Core assertions:

```js
assert.equal(loginResponse.status, 200);
assert.match(loginHtml, /class="horizon-auth-shell"/);
assert.match(loginHtml, /Build securely\./);
assert.match(loginHtml, /action="[^"]*\/login-actions\/authenticate/);
assert.match(loginHtml, /horizon-login\.css/);

assert.ok(errorResponse.status >= 400 || errorResponse.status === 200);
assert.match(errorHtml, /class="horizon-auth-shell"/);
assert.doesNotMatch(errorHtml, /Exception|stack trace|client_secret/i);
```

Use `spawnSync` for Docker lifecycle commands and bounded `fetch` polling for readiness. Resolve the realm file to an absolute path before mounting it. Never target a non-process-unique container or image in cleanup.

- [ ] **Step 2: Add the explicit live verification script**

```json
"verify:keycloak-theme-live": "node --test tests/live/keycloak-theme-smoke.test.mjs"
```

- [ ] **Step 3: Run the live smoke and inspect the initial failure**

Run:

```bash
pnpm verify:keycloak-theme-live
```

Expected on the first run: FAIL on a concrete FreeMarker, asset, or rendering mismatch if the static implementation is incomplete. Do not weaken the assertions; fix the theme at the public rendering seam.

- [ ] **Step 4: Correct only the mismatches exposed by real Keycloak**

Typical allowed fixes are preserving an upstream nested slot in `template.ftl`, correcting a parent property class, or correcting a resource-relative URL. Do not add a Horizon credential handler or JavaScript form submission.

- [ ] **Step 5: Re-run the live smoke until it passes**

Run:

```bash
pnpm verify:keycloak-theme-live
```

Expected: PASS, with the temporary container and image removed by the test.

- [ ] **Step 6: Commit the real rendering proof and any theme corrections**

```bash
git add package.json tests/live/keycloak-theme-smoke.test.mjs apps/platform-api/keycloak/themes/horizon
git commit -m "test(auth): verify Horizon theme in Keycloak"
```

---

### Task 6: Document operation and run the full regression gate

**Files:**

- Modify: `README.md`
- Verify: `tests/integration/keycloak-oidc-callback-contract.test.mjs`
- Verify: `tests/integration/platform-auth-native-contract.test.mjs`
- Verify: `tests/e2e/keycloak-production-contract.test.mjs`

- [ ] **Step 1: Document local theme restart and verification**

Add below the local development stop command:

````markdown
Keycloak uses the Horizon login theme in local development. Theme files are bind-mounted from
`apps/platform-api/keycloak/themes/horizon`; after changing them, recreate Keycloak and rerun its
bootstrap job:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --force-recreate keycloak keycloak-bootstrap
pnpm verify:keycloak-theme-live
```
````

- [ ] **Step 2: Run the targeted theme, realm, release, and OIDC suites**

Run:

```bash
node --test \
  tests/unit/keycloak-theme.test.mjs \
  tests/unit/keycloak-realm-config.test.mjs \
  tests/unit/keycloak-bootstrap-clients.test.mjs \
  tests/integration/release-workflow-contract.test.mjs \
  tests/integration/swarm-stack-contract.test.mjs \
  tests/integration/keycloak-oidc-callback-contract.test.mjs \
  tests/integration/platform-auth-native-contract.test.mjs \
  tests/e2e/keycloak-production-contract.test.mjs
```

Expected: all targeted tests pass with 0 failures.

- [ ] **Step 3: Run the real Keycloak rendering smoke again**

Run:

```bash
pnpm verify:keycloak-theme-live
```

Expected: PASS.

- [ ] **Step 4: Run repository quality and regression gates**

Run:

```bash
pnpm check:ci
pnpm test
```

Expected: both commands exit 0.

- [ ] **Step 5: Validate both deployment manifests**

Run:

```bash
docker compose --env-file .env -f docker/docker-compose.yml config --quiet
docker stack config -c docker/docker-compose.release.yml -c docker/docker-compose.openbao.yml >/dev/null
```

Expected: both commands exit 0 with no interpolation or Swarm schema errors.

- [ ] **Step 6: Review the final diff against the approved design**

Run:

```bash
git diff --check
git status --short
```

Confirm every acceptance criterion in `docs/superpowers/specs/2026-08-09-horizon-keycloak-theme-design.md` has corresponding implementation and fresh verification evidence.

- [ ] **Step 7: Commit documentation**

```bash
git add README.md
git commit -m "docs(auth): document Horizon Keycloak theme"
```
