# Phase 5–6 Pilot Evidence

## Local code evidence — 2026-07-14

The focused suite passed in the `platform-api` Compose container:

```sh
EVCP_ALLOW_SIMULATE_LOGIN=1 node --import tsx --test \
  tests/unit/persisted-ai-execution-runtime.test.mjs \
  tests/unit/durable-ai-job-worker.test.mjs \
  tests/unit/ai-secret-store.test.mjs \
  tests/unit/creator-web-render-smoke.test.mjs \
  tests/unit/app-store-bootstrap.test.mjs
```

Result: 51 passing, 0 failing.

This covers encrypted durable payloads, lease recovery, persisted route/key/quota
resolution, organization/creator/project/app quota reconciliation, bounded retry,
circuit opening, secret-store references, and the Creator fail-closed default
route.

The durable worker also renews its PostgreSQL lease while an execution is in
flight. A competing worker cannot reclaim a long-running job after its original
lease window, while an abandoned worker remains recoverable after lease expiry.
This prevents duplicate provider calls during a slow but still-live execution.

An isolated PostgreSQL database was migrated and seeded with
`EVCP_SEED_DEMO_PROJECT` unset, then deleted. It contained `projects=0`,
`demo_users=0`, `system_users=1`, and `roles=3`. This proves the clean seed
starts with only non-login bootstrap metadata; Keycloak-projected human users
are created on their first real login.

The local Compose Platform API was restarted after applying the Phase 5–6
migrations. `prisma migrate deploy` reported 27 migrations with no pending
migration, then `GET http://localhost:3100/health` returned `healthy` with
`EVCP_CORE_PERSISTENCE=prisma` and `authMode: platform_session`. The running
pilot configuration does not advertise or accept mock-header authentication.

`CI=true pnpm check:changed --base origin/main` also passed after the durable
HTTP adapter was extracted from the oversized application factory; conflict,
design-system, frontend-architecture, lint, package-script, and changed-file
checks all passed.

The OpenBao Compose service was pulled and started successfully with its
persistent volume and no published host port. A local-only verification instance
was initialized and unsealed with a temporary workload token stored outside the
repository. From the Platform API container, the KV v2 adapter completed a
write/read round trip and returned only `openbao-kv-v2-roundtrip-ok`. No root
token, unseal key, or provider credential was printed or committed. Production
operators must initialize their own OpenBao volume and issue their own
least-privilege workload token; the local token is not production evidence.

The local stack was re-verified after the fail-closed provider-test and durable
job isolation fixes. Both Phase 5–6 migrations were recorded as applied,
OpenBao reported `sealed=false`, the mounted workload token received `404`
(authorized read of an intentionally absent readiness key, not `403`), and the
Platform API was force-recreated without deleting volumes. It returned healthy
with `authMode: platform_session`; startup logs contained no disabled-worker,
fatal, unhandled, or migration-failure marker. This empty baseline was captured
before the operator-authorized local Anthropic browser drill described below;
the later rows intentionally contain redacted governance and execution evidence.

## Local browser evidence — 2026-07-14

A disposable Keycloak account was created only for this test and removed
immediately afterwards.  The Admin browser flow passed against the local Compose
stack:

1. Admin's **Continue with Keycloak** redirected to the real Keycloak login
   form, with username and password inputs.
2. Keycloak callback issued a Platform session and loaded the Admin dashboard.
3. After a Platform API restart and health recovery, a browser reload retained
   the persisted session and loaded the dashboard without another login.
4. Admin logout invoked RP-initiated Keycloak logout and returned to
   `/admin/`. A subsequent login returned to the Keycloak username/password
   form, proving the SSO session was ended.

The test also found an existing local client configuration missing its
`post.logout.redirect.uris` value. The bootstrap script already manages this
setting; it was reapplied to the local Keycloak client and the logout redirect
was verified. Clean pilot deployment must run the bootstrap service before the
same browser test.

Two additional disposable users verified the non-admin surfaces. A Creator in
`evcp-creators` reached the API-backed empty-project page without demo records;
an end user in `evcp-users` reached the App Store's API-backed empty state
without a browser crash. App Store now uses the Caddy `/api` route in local Vite
mode and its logout revokes the Platform session before RP-initiated Keycloak
logout. After confirming logout, Keycloak displayed its username/password form.
Both temporary accounts were deleted after verification.

Admin AI governance was then exercised end to end with an operator-supplied
Anthropic credential entered only through the browser. The first load exposed a
real HTTP wiring defect: AI governance routes were still registered against the
legacy synchronous handler, so durable Platform sessions received `401` while
`/auth/me` succeeded. A regression test now covers persisted-session access at
the HTTP boundary, and the routes use the asynchronous persistence handler.

After that fix, Admin registered the native Anthropic endpoint, stored the
credential through OpenBao KV v2, configured the `frontend_coding` route, saved
an organization hard-stop quota, and activated a blocking guardrail. The live
test succeeded with `claude-sonnet-4-5`, 28 tokens, and 2268 ms latency. The
database contained one provider, one masked credential whose stored value was a
`vault://` reference with `encryption_provider=vault-kv-v2`, one governed route,
and succeeded execution evidence. No plaintext credential was selected or
printed.

Platform API was then force-recreated without deleting PostgreSQL or OpenBao
volumes. Health returned `authMode: platform_session`, Admin reloaded the
persisted provider and masked credential, and the same live test succeeded
again with 28 tokens and 3164 ms latency. This is local restart evidence that
the provider credential is recovered from OpenBao rather than process memory or
an environment variable. It is not a substitute for the clean pilot gate below.

The same persisted provider and route were exercised for all six scenarios:
`prd_generation`, `requirement_analysis`, `frontend_coding`, `backend_coding`,
`review`, and `documentation`. Every call completed with
`claude-sonnet-4-5` and persisted sanitized provider/token/latency evidence. A
hard-stop quota of one token blocked before the external call and did not add a
succeeded evidence row. A configured prompt guardrail did the same. An invalid
disposable primary endpoint produced a persisted fallback result through the
Anthropic provider; the route and disposable database provider were removed
afterwards.

A Creator logged in through real Keycloak, created project
`prj_684d86e69f904fa29a1115b19e01a22c`, completed its initial governed build,
and submitted a second live change. Source commits `c72555e8` and `8cb5fdac`
were persisted. The preview authorization flow was changed during this drill:
the bearer token is no longer present in iframe/link URLs. An authenticated POST
sets an HttpOnly, SameSite=Strict, project-path cookie, and every AI commit or
manual preview refresh reauthorizes before rendering the iframe. Contract tests
and a browser reload confirmed the preview URL contains no token and no stale
authorization 401 is exposed.

## Local durable restart/idempotency evidence — 2026-07-14

The live restart drill found and fixed a Prisma mapping defect: the schema field
is `actorUserId`, while the queue domain field is `actorId`. Before the fix the
HTTP enqueue returned 500 and a recovered worker could not resolve its actor.
The repository now maps both directions explicitly and the regression test
asserts that Prisma never receives an unknown `actorId` property.

With the fixed worker loaded, a PostgreSQL job was placed in `running` state
with an expired lease owned by a terminated worker. After Platform API restart,
the new worker reclaimed it and completed through `aip_anthropic`; its encrypted
payload retained the authenticated `v1.*` AES-GCM envelope and did not contain
the prompt. The job reached `succeeded` with one execution-evidence row. To
simulate a crash after provider completion but before the queue result was
recorded, the same request was requeued. It returned to `succeeded`, while the
evidence count remained `1 → 1`; request idempotency therefore prevented a
second provider-usage record.

## Local encrypted restore evidence — 2026-07-14

PostgreSQL was dumped in custom format, encrypted with AES-256-CBC/PBKDF2, and
restored into an isolated database. Source and restore counts matched exactly
for platform users, projects, AI execution evidence, and durable jobs
(`12|1|17|1`). The encrypted artifact began with the OpenSSL salted envelope,
not a PostgreSQL dump header, and the isolated database and temporary artifact
were removed after verification.

A MinIO object in the Creator project's own bucket was backed up through the
same encrypted boundary, deleted, restored, and read again. Its SHA-256 matched
before and after restore. The disposable proof object and encrypted local
artifact were removed. This is repeatable local recovery evidence, but it does
not certify external destination ownership or retention.

## Required private-pilot evidence — not yet certified

The following cannot be truthfully completed from a developer laptop because they
require environment-owned infrastructure and an operator-managed provider key.

| Gate | Required operator configuration | Pass assertion |
| --- | --- | --- |
| OpenBao provider call | operator-owned `VAULT_ADDR`, mounted `VAULT_TOKEN_FILE`, and provider key created from Admin | Local Admin and Creator calls use the same persisted route and DB contains no key; repeat on pilot OpenBao |
| Browser E2E | clean pilot hostname/TLS and Keycloak client redirect URIs | Local Admin, Creator, App Store, logout/revoke, AI commits, restart, and token-free preview passed; repeat on pilot hostname |
| Backup and restore | encrypted external backup destination and retention policy | Local isolated PostgreSQL and MinIO encrypted restores passed; external destination/retention and Keycloak export remain |
| Rollback/outage | versioned image registry and controlled provider/network outage | Live provider failure/fallback and exactly-once recovery passed; versioned registry rollback remains |

## Local Phase 7–8 hardening evidence — 2026-07-14

Migration `20260714040000_workspace_code_checkpoints` was applied to the running PostgreSQL
volume. Platform API restarted with `authMode: platform_session`, the existing Creator project
count remained `1`, and the container remained running without a restart loop. A restart defect
found during this drill was fixed by mounting a Linux-only named `node_modules` volume over the
development source bind mount; macOS native binaries can no longer enter the Linux container.

Generation now records one immutable Prisma checkpoint per successful project/commit. Publish
rollback rejects a commit older than an applied database migration before changing the current
source tree. Startup removes only labelled orphan development workspaces and preserves deployed
app containers and older unlabelled containers.

Release Compose publishes only Caddy HTTP/HTTPS. PostgreSQL, Redis, MinIO, Keycloak, Platform API,
the web surfaces, and generated containers remain internal. Browser-visible MinIO URLs are signed
against the exact public storage origin. Generated-app proxy contracts prove unauthenticated
requests return `401`, authenticated nonmembers return `403` without contacting the container,
and authorized members reach only a healthy deployment with authorization/cookie headers stripped.

## Operator execution order

1. Deploy the release Compose files with `EVCP_CORE_PERSISTENCE=prisma`, no demo
   seed, mock-header auth disabled, and unique production secrets.
2. Start OpenBao using `docker/docker-compose.openbao.yml`, enable KV v2 at the
   configured mount, and mount a least-privilege token at `VAULT_TOKEN_FILE`.
3. Create the provider and API key from Admin. Do not place the key in `.env`.
4. Execute one Admin provider test call and one Creator request with distinct
   idempotency keys. Inspect AI execution, audit, and quota rows for the same
   actor/project/provider trace.
5. Restart Platform API while a durable job is leased, then verify the recovered
   worker produces one execution evidence record for its request id.
6. Execute backup, restore to an isolated target, release rollback, and provider
   outage tests. Attach redacted command output and timestamps to this document.

Do not mark the Phase 5 or 6 exit gate complete until every table row above has
dated evidence from the clean pilot environment.
