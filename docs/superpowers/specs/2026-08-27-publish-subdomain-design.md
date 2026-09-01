# Publish Subdomain Design

Date: 2026-08-27

## Summary

Horizon Creator will let a project owner choose a platform-managed subdomain while publishing an app. The platform will continue to support the existing `/apps/<resource-key>` URL as a fallback, while Store launches will prefer the selected subdomain. Custom domains and customer-managed DNS will be visible in the Publish UI but disabled in this phase.

The first supported development URL shape is:

```text
http://<subdomain>.localhost:9800
```

An installation may configure a platform-owned base domain later through `EVCP_APP_SUBDOMAIN_BASE_DOMAIN`, producing `https://<subdomain>.<base-domain>`. This setting represents wildcard DNS and TLS managed by the platform operator; it is not the disabled customer DNS workflow.

## Goals

- Generate a valid subdomain suggestion from the project name.
- Let the creator edit the suggestion before publishing.
- Validate format and uniqueness before starting a deployment.
- Persist the selected subdomain in the App Store registry.
- Launch an authorized app from `/store` on its subdomain.
- Preserve path-based launch and previously published apps.
- Make the future custom-domain/DNS option visible but unavailable.

## Non-goals

- Customer-owned domain verification.
- DNS record creation or verification.
- Automated certificate issuance for customer domains.
- Removing `/apps/<resource-key>` routes.
- Supporting arbitrary ports, schemes, paths, or full URLs in the subdomain field.
- Changing app membership, invitation, or role semantics.

## Creator UX

The Publish page gains an **Access URL** section before the readiness checklist.

### Platform subdomain

The enabled option is selected by default and contains:

- A `Subdomain` text field.
- An automatically generated, editable value derived from the project name.
- A read-only URL preview.
- Supporting copy stating that the existing path URL remains available.

Normalization is deterministic:

1. Lowercase the project name.
2. Transliterate only when a supported ASCII transliteration exists; otherwise omit unsupported characters.
3. Replace runs of non-alphanumeric characters with `-`.
4. Trim leading and trailing hyphens.
5. Fall back to the immutable project resource key when the result is empty.
6. Limit the label to 63 characters.

The creator may replace the suggestion. An accepted label must:

- Be 3–63 characters.
- Contain only lowercase `a-z`, digits, and single hyphen-separated segments.
- Start and end with an alphanumeric character.
- Not be a reserved platform label such as `admin`, `api`, `auth`, `creator`, `store`, `storage`, or `www`.

Inline validation runs before publish. The API remains authoritative and can return `SUBDOMAIN_INVALID` or `SUBDOMAIN_TAKEN`.

### Custom domain / DNS

A second option is rendered as disabled with a `Coming soon` badge. Its domain input, DNS instructions, and verification action remain disabled. Copy explains that customer-managed DNS will be delivered in a later phase. No custom-domain request is sent by this UI.

### Publish behavior

`Publish to App Store` remains the single primary action. It is disabled when readiness fails, while publishing is in progress, or when the subdomain is invalid. A uniqueness conflict keeps the entered value and moves focus to the field.

After success, **Latest deployment** shows both:

- Primary subdomain URL.
- Fallback path URL.

## API Contract

The app-store publish overload accepts:

```ts
type AppStorePublishInput = {
  subdomain: string;
};

publishProject(projectId: string, input: AppStorePublishInput): Promise<PublishResultResponse>;
```

The existing staging/production overload remains unchanged.

`PublishResultResponse.registryEntry` and Store-facing app DTOs add:

```ts
subdomain?: string;
subdomainUrl?: string;
```

`subdomain` is the normalized label. `subdomainUrl` is server-derived from trusted runtime configuration; clients never construct the production base domain themselves.

The publish endpoint validates and reserves the subdomain before building a new image. A conflict returns HTTP 409 with `SUBDOMAIN_TAKEN`. Invalid input returns HTTP 400 with `SUBDOMAIN_INVALID`. Deployment failure does not change the currently published registry subdomain.

## Persistence

`AppStoreRegistryEntry` gains a nullable, unique `subdomain` column. Existing rows remain valid with `NULL` and continue using path-based launch.

The publish transaction updates the registry subdomain only after the runtime deployment is healthy and the registry publish succeeds. The audit event `app.publish.completed` includes the normalized subdomain and both access routes.

Subdomain uniqueness is enforced twice:

- A service-level preflight provides a friendly error before deployment.
- A database unique constraint closes concurrent-publish races.

## Host Routing

### Local development

Caddy matches `*.localhost` before the default admin route and proxies those requests to Platform API. `localhost`, `/creator`, `/store`, `/api`, and `/auth` behavior is unchanged.

Platform API extracts the hostname, validates it against the configured subdomain suffix, and resolves the label through the published registry. Only a registry entry with a healthy production deployment can be proxied.

### Configured platform domain

`EVCP_APP_SUBDOMAIN_BASE_DOMAIN` optionally defines a platform-owned wildcard domain. The operator is responsible for wildcard DNS and TLS for this base domain. This is deployment configuration, not customer DNS configuration.

Unknown labels return 404. Known labels without a healthy deployment return 503. Authenticated users without app access receive 403.

## Store Launch and Authentication

Platform session cookies on `localhost` are not assumed to be available on `<subdomain>.localhost`. Store launch therefore uses a one-time handoff rather than placing a bearer token in a query string.

1. The Store calls `POST /store/apps/:appSlug/launch-session` on the platform origin.
2. Platform API authorizes current membership and creates a cryptographically random, single-use launch grant with a 60-second TTL.
3. The response returns the server-derived subdomain launch URL containing only the opaque grant identifier.
4. The browser navigates to `http://<subdomain>.localhost:9800/__launch/<grant>`.
5. Platform API atomically consumes the grant, verifies that its app matches the request host, sets the host-only `evcp_app_token` cookie with `HttpOnly`, `SameSite=Lax`, and a 15-minute TTL, then redirects to `/`.
6. Subsequent requests on the subdomain use the same membership check and strip authorization/cookie headers before proxying to the generated app container.

Launch grants are stored in Redis so they work across API replicas. They never appear in application logs or audit metadata. Reuse, expiry, host mismatch, or missing access returns a generic 403 page without revealing the app or account.

Path-based launch keeps the current scoped-cookie flow for registry entries without a subdomain and as a fallback when the subdomain runtime is unavailable.

## Store UX

App cards and App Details show the platform subdomain as the primary access URL when present. `Open app` requests a launch session and follows the returned launch URL. The Store never derives a hostname from untrusted registry values.

The existing active/pending/available access rules remain unchanged. A pending invitation does not bypass membership activation.

## Security and Reliability

- Subdomain labels are normalized and validated on the server.
- Reserved labels protect platform surfaces.
- Host resolution uses persisted registry data rather than forwarding arbitrary hostnames.
- One-time launch grants are opaque, short-lived, atomic, and never contain bearer tokens.
- Proxy code keeps removing authorization and cookie headers before forwarding to generated apps.
- Path access remains available for rollback and compatibility.
- Republish updates routing only after health and persistence succeed.

## Error Handling

- Invalid label: inline UI error and HTTP 400 `SUBDOMAIN_INVALID`.
- Duplicate label: inline UI error and HTTP 409 `SUBDOMAIN_TAKEN`.
- Publish failure: retain the previous deployment and previous subdomain.
- Launch grant expired or reused: generic Store launch error with retry.
- Unknown subdomain: 404.
- Deployment unhealthy: 503 with no container details.
- Unauthorized or unassigned user: 401/403 following current platform policy.

## Migration and Compatibility

The database migration adds only a nullable column and unique index. Existing registry entries, manifests, deployments, clients, and path URLs continue to work. DTO fields are optional during rollout so API and web applications can be deployed independently.

On the first republish after this feature ships, the Creator UI suggests a subdomain. No existing app is assigned one automatically without a successful publish.

## Testing

### Unit

- Project-name normalization and fallback.
- Reserved, malformed, short, and long labels.
- Duplicate-label conflict.
- Publish compensation preserves the previous subdomain.
- Hostname parsing and registry resolution.
- Launch grant creation, expiry, single use, and host binding.
- Publish UI enabled/disabled states and error messages.
- Custom DNS controls remain disabled.

### Integration

- Prisma migration and uniqueness constraint.
- Publish request persists the selected label and returns `subdomainUrl`.
- Caddy routes `*.localhost` to Platform API without changing platform routes.
- Host-based proxy enforces healthy deployment and membership.
- Store launch grant sets the cookie on the subdomain and redirects to `/`.
- Existing `/apps/<resource-key>` launch remains operational.

### Live verification

1. Publish a project with an edited label.
2. Confirm the Store card and detail page show the subdomain.
3. Launch from `/store` and land on `http://<label>.localhost:9800/`.
4. Exercise the generated app and confirm API-backed data loads.
5. Verify an unassigned user receives 403.
6. Republish with the same label and confirm routing remains stable.
7. Attempt a duplicate label from another project and confirm the existing app is unaffected.

## Rollout

The UI and API ship together behind the presence of the server-provided subdomain base configuration, with `.localhost` enabled automatically in local development. Custom domain/DNS controls stay disabled in every environment for this phase.
