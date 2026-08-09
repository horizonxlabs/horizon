# Horizon Keycloak Theme Design

**Date:** 2026-08-09  
**Status:** Approved
**Visual direction:** Brand Split  
**Language:** English only

## Summary

Replace Keycloak's default authentication pages with a first-party Horizon theme while preserving Keycloak as the identity and session authority. The theme covers the complete browser authentication flow, uses the same Horizon visual language as the application login shell, and ships consistently in local development and release deployments.

The change is presentational and deployment-focused. It does not replace Keycloak, proxy credential submission through a Horizon frontend, or change OIDC callback and session behavior.

## Goals

- Present Horizon branding on every user-facing Keycloak authentication screen.
- Use the approved Brand Split layout on desktop and a focused single-panel layout on mobile.
- Keep all authentication text in English.
- Support existing persisted realms as well as clean installations.
- Package the theme reproducibly for local Compose and versioned releases.
- Preserve Keycloak's form actions, required-action context, validation, security fields, and accessibility semantics.

## Non-goals

- Building a separate authentication service or collecting passwords in a Horizon application.
- Redesigning the Admin, Creator, or Store pre-login screens.
- Adding self-registration or changing realm authentication policies.
- Adding Thai translations or a runtime language switcher.
- Changing OIDC clients, callback paths, session rotation, logout, or access-control rules.
- Customizing the Keycloak Admin Console or account-management console.

## Architecture

### Native child theme

Create `apps/platform-api/keycloak/themes/horizon/login` as a native Keycloak login theme that inherits from the Keycloak 26.2 `keycloak.v2` theme. Horizon owns the shared page frame, CSS, fonts, images, and English message overrides. Keycloak continues to own the individual authentication forms and their runtime data.

The shared `template.ftl` override supplies the Brand Split shell for inherited and custom authentication pages. It retains the macro contract expected by the parent theme so login, password recovery, required actions, OTP, identity-provider selection, informational pages, and error pages render inside the same shell without duplicating their form logic.

Theme assets are self-contained. No authentication page loads fonts, scripts, images, or styles from an external CDN.

### Realm activation

The realm import declares `loginTheme: "horizon"` for clean installations. The idempotent Keycloak bootstrap job also updates `realms/$KEYCLOAK_REALM` with `loginTheme=horizon`, so an existing persisted realm receives the theme without deleting Keycloak data or recreating users.

The bootstrap keeps its existing SSL and client reconciliation behavior. Theme activation is an additional realm update, not a replacement for those updates.

### Development packaging

Local Docker Compose bind-mounts the Horizon theme directory read-only at `/opt/keycloak/themes/horizon`. This keeps the one-command `pnpm dev:setup` workflow and allows theme changes to be tested by restarting Keycloak without rebuilding the entire application stack.

### Release packaging

Add a small `docker/keycloak.Dockerfile` based on `quay.io/keycloak/keycloak:26.2`. It copies the Horizon theme into `/opt/keycloak/themes/horizon` and otherwise retains the existing production Keycloak command and configuration.

The release workflow builds, tags, pushes, signs, and records `evcp-keycloak` alongside the other versioned Horizon images. The release Compose file references `${EVCP_IMAGE_REPOSITORY}/evcp-keycloak:${EVCP_VERSION}` instead of the upstream image directly. This ensures a release tag identifies the exact login experience deployed with that platform version.

Keycloak data remains in PostgreSQL. Replacing the image does not replace the realm database, users, credentials, or sessions.

## User Experience

### Desktop

At widths of 768 pixels and above, the page uses a two-column shell:

- The left brand panel uses a deep slate-to-blue background, Horizon wordmark, the headline `Build securely. Move with clarity.`, supporting enterprise copy, and the platform descriptor.
- The right content panel contains the Keycloak-provided page title, form fields, validation, recovery links, actions, and contextual help.
- The form column remains narrow enough for efficient scanning and predictable password-manager behavior.

### Mobile

Below 768 pixels, the decorative brand panel is hidden. The Horizon mark and product name remain above the form, which fills the available viewport with touch-friendly controls and safe horizontal padding.

### Covered states

The shell and styling apply to:

- Username/password login
- Forgot password and reset password
- Required password update
- OTP and other configured required actions
- Identity-provider and account-choice lists when configured
- Informational, expired-action, and error pages

All visible copy is English. Browser locale does not switch the theme into Thai.

## Error and Security Behavior

- Validation and authentication errors are rendered from Keycloak's message context inside an accessible alert region.
- The theme does not hard-code form action URLs, session codes, execution identifiers, CSRF values, or redirect URIs.
- Password fields preserve browser autocomplete semantics and password-manager compatibility.
- Error copy remains user-safe and does not expose stack traces, client secrets, token contents, or internal service addresses.
- Keyboard focus is visible on fields, links, and actions. Text and controls meet WCAG 2.1 AA contrast targets.
- Motion is limited to short color and shadow transitions and is disabled when the user requests reduced motion.
- If a theme asset fails to load, the inherited semantic form remains usable and the Horizon name remains available as text.

## Data Flow

1. A Horizon frontend starts the existing Platform API login endpoint with a validated return target.
2. The Platform API creates the existing OIDC state and redirects the browser to Keycloak.
3. Keycloak renders the requested authentication state through the `horizon` login theme.
4. The user submits directly to the Keycloak-generated form action.
5. Keycloak completes its existing authentication or required-action flow and redirects to the unchanged Platform API callback.
6. The Platform API validates state, exchanges the authorization code, creates the Horizon session, and returns the user to the original surface.

No credential or token passes through theme-owned JavaScript.

## Test Seams

Testing follows four public seams agreed during design review:

1. **Realm/bootstrap seam:** static and script contract tests prove clean realm imports and idempotent bootstrap both select `horizon` while retaining existing realm reconciliation.
2. **Deployment seam:** Compose and release contract tests prove the theme is mounted in development and packaged through the versioned release image and workflow.
3. **Browser/auth seam:** a real Keycloak smoke test requests the authorization endpoint and verifies Horizon branding, the Keycloak form action, English content, and theme assets render. A negative/error state verifies alerts remain within the Horizon shell.
4. **Regression seam:** existing authentication integration tests verify login callback, state validation, refresh, logout, and authorization behavior are unchanged.

Each implementation slice starts with a failing test at one of these seams, followed by the smallest change that makes it pass.

## Operational Notes

- Existing local Keycloak containers must be recreated or restarted after adding the bind mount.
- Existing realms are updated by the bootstrap job; clearing the Keycloak volume is neither required nor desired.
- Release deployment pulls the versioned `evcp-keycloak` image before replacing the running task.
- Rollback selects the earlier release image while continuing to use the same PostgreSQL realm data.
- Keycloak health checks and readiness requirements remain unchanged.

## Acceptance Criteria

- Every supported Keycloak authentication state renders in the approved Brand Split shell on desktop.
- The same states render as a usable single-panel form below 768 pixels.
- All user-facing authentication copy is English and default Keycloak branding is absent from the user journey.
- Clean and existing realms use `loginTheme=horizon` without resetting realm data.
- `pnpm dev:setup` exposes the custom theme through local Keycloak.
- The release workflow publishes a versioned Keycloak image containing the theme.
- A real Keycloak authorization request proves the form remains functional.
- Existing OIDC, callback, refresh, logout, and access-control regression tests pass unchanged.
