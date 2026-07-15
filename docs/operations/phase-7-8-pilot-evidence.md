# Phase 7–8 Workspace and Publish Evidence

## Result — 2026-07-15

Phase 7 and Phase 8 have implementation and repeatable local real-stack evidence. The remaining
clean-host, public TLS, real-browser Keycloak, external backup, and registry-outage certification is
tracked in Phase 10; it is not claimed by this document.

## Guaranteed runtime behavior

- A real workspace is not reported as `running` until its locked `/api/health` endpoint responds.
- Development source lives in a labelled, project-scoped Docker volume. Delete, failed provision,
  and orphan reconciliation remove abandoned volumes as well as containers.
- PostgreSQL roles/schemas and MinIO users/policies are project-scoped. Partial creation is rolled
  back, and real mode fails closed without operator-injected encryption, LiteLLM, and MinIO admin
  credentials.
- Generation turns are FIFO-serialized per project, so two turns cannot mutate the same workspace
  concurrently; turns for different projects may proceed concurrently.
- Each build turn runs `prepare → actions → validate → commit → migrations → checkpoint`.
  Validation or action failure restores the starting commit, removes untracked output, creates no
  checkpoint, and keeps the last-known-good preview available.
- Validation copies source into a disposable temporary tree, excludes active `.next` output, reuses
  the existing dependency directory through a symlink, builds only in the temporary tree, and
  always removes it. Validation therefore does not mutate or race the live preview's `.next`.
- All migration actions emitted by one turn execute as one PostgreSQL transaction after code
  validation and commit. Generated transaction-control SQL—including `ABORT`, `ABORT WORK`,
  `ABORT TRANSACTION`, bare `END`, `END WORK`, and `END TRANSACTION`—is rejected before database
  execution, so an action cannot escape the managed transaction boundary. The transaction uses the
  project schema search path; after it succeeds, all migration evidence is written as one atomic Prisma
  batch and records the resulting source commit. If any migration statement fails, PostgreSQL rolls
  back the whole SQL batch, the workspace source is restored, and no checkpoint is created. The
  application-schema transaction and the subsequent platform evidence transaction are intentionally
  ordered but are not claimed to be one cross-database distributed transaction. An evidence-write
  failure therefore creates no partial evidence rows and stops the turn before its checkpoint, but
  it cannot roll back application-schema SQL that already committed.
- Published containers run immutable versioned images without a shared `/workspace` volume. Every
  revision receives a unique, non-moving image tag and container name, including repeat publishes
  of the same source commit; its persisted image ID/digest is the immutable artifact identity.
- If manifest/registry persistence fails after runtime readiness, publish, rollback, and promote all
  compensate by marking the new revision failed and removing only its container. The previous
  healthy route remains authoritative.
- Rolling back one app changes only that app's persisted route and revision container; another app's
  current route and container remain unchanged.
- Routing selects only a healthy persisted deployment revision. Rehydration re-inspects and
  re-probes the exact persisted container after a Platform API restart.
- The Prisma deployment write queue flushes revision creation and its health update in one
  transaction. If health persistence is rejected, it rolls back durable and optimistic state,
  removes the candidate container, and leaves no phantom revision. The queue then recovers; the next
  successful publish persists as revision 1 rather than inheriting the rejected candidate's number.
- Generated-app proxy contracts enforce `401` for no session, `403` for a nonmember, and strip
  platform authorization/cookie headers before forwarding an authorized request.

## Live workspace and generation proof

The opt-in integration test used the local Docker/PostgreSQL/MinIO/LiteLLM/OpenBao stack and an
operator-configured provider. Secret values were loaded from server-held configuration and were not
printed.

```sh
EVCP_VIBE_LIVE=1 EVCP_TEST_SEED=<unique-number> \
  pnpm exec tsx --test tests/integration/vibe-coding-e2e-live.test.mjs
```

Result: 1 passing, 0 failing; test duration 83,983.24 ms (83.98 seconds).

The test proved one flow, not separate mocks:

1. Created the authoritative PostgreSQL user/project and provisioned a real schema, scoped role,
   MinIO bucket/identity, LiteLLM virtual key, labelled volume, and isolated container.
2. Waited for preview readiness, invoked the governed live provider, wrote a real file, ran a
   production Next build, committed it, and created one immutable Prisma checkpoint.
3. Applied a deterministic invalid code action. Build validation failed, Git HEAD and source bytes
   returned to the successful commit, checkpoint count remained one, and the preview returned 2xx.
4. Removed the development container, reconstructed the orchestrator from its Prisma runtime
   record and encrypted secrets, recreated the container from the retained volume, and recovered
   the same source, chat history, and checkpoint.
5. Deleted the project and confirmed its container, volume, PostgreSQL schema/role, MinIO identity
   and bucket, LiteLLM key, and encrypted secret rows were released.

This drill exposed and fixed two real lifecycle defects: provisioning previously returned while the
entrypoint was still mutating `node_modules`, and deletion previously left a roughly 584 MB named
volume per workspace. Readiness gating and managed-volume lifecycle regression tests now cover both.

Deterministic generation contracts additionally cover the lifecycle ordering, atomic multi-migration
failure rollback, transaction-control SQL rejection, atomic migration-evidence batching, same-project
FIFO serialization, and concurrent progress for different projects:

```sh
pnpm exec tsx --test \
  tests/unit/action-runner-migration-hardening.test.mjs \
  tests/unit/container-git.test.mjs \
  tests/unit/generation-service-atomicity.test.mjs \
  tests/unit/generation-service-concurrency.test.mjs \
  tests/unit/migration-runner.test.mjs
```

## Live publish, failure, restart, and rollback proof

```sh
EVCP_PUBLISH_LIVE=1 EVCP_TEST_SEED=<unique-number> \
  pnpm exec tsx --test tests/integration/publish-runtime-live.test.mjs
```

Result: 1 passing, 0 failing; test duration 167,131.74 ms (167.13 seconds).

The test built and ran real production images on the internal Docker network:

1. Published healthy versions A and B with distinct source commits, image tags, container names,
   image digests, and Prisma deployment revisions.
2. Published a valid image whose locked readiness endpoint returned `503`. The replacement was
   recorded as failed and removed; version B remained running and authoritative.
3. Rolled back to version A. The deployed page returned version A content, while the development
   checkout returned to its pre-rollback commit.
4. Reconstructed the Prisma deployment store and rehydrated the exact healthy rollback container
   after a simulated Platform API restart.
5. Removed all disposable containers and database evidence created by the test.

Focused proxy, persistence, and deployment-invariant contracts cover member authorization,
environment-isolated routing, no-environment publish linkage, restart readiness re-probe, Prisma
deployment reconstruction, unique immutable tags for repeated publishes, publish/rollback/promote
persistence compensation, cross-app rollback isolation, and Prisma queue failure/recovery without
phantom revisions. The safety contract additionally injects a rejected health write, proves the
create/update transaction rollback and candidate cleanup, then proves the next publish persists as
revision 1:

```sh
pnpm exec tsx --test \
  tests/unit/publish-deployment-invariants.test.mjs \
  tests/unit/prisma-deployment-store.test.mjs \
  tests/unit/publish-service-safety.test.mjs \
  tests/integration/publish-apps-proxy.test.mjs
```

## Migration and regression proof

All 29 migrations were applied from zero against a throwaway PostgreSQL database. The final schema
contained `workspace_deployment_revisions`, and the database was dropped after verification.

The final #149 branch passed `CI=true pnpm check:ci` with exit code 0 on 2026-07-15. A subsequent
fresh `pnpm test:unit` rerun also exited 0:

- latest unit rerun: 542 tests, 541 passed, 1 intentional skip, 0 failed;
- integration: 162 passed, 8 opt-in live skips;
- E2E: 92/92 passed;
- repository hygiene, install contract, conflict-marker scan, workspace scripts, design-system and
  frontend-architecture checks, lint, typecheck, and all application/package builds passed.

## Rerun prerequisites

- Docker socket access and the private-stack internal network;
- a built workspace image matching `EVCP_WORKSPACE_IMAGE`;
- PostgreSQL and MinIO admin endpoints reachable from the test process while generated containers
  receive their internal hostnames;
- LiteLLM and OpenBao reachable through local-only test proxies or from an in-network runner;
- `VAULT_TOKEN_FILE` pointing to a least-privilege workload token file;
- `EVCP_CORE_PERSISTENCE=prisma` and a unique `EVCP_TEST_SEED`.

Never place or print a provider API key in the command. Register it through Admin/OpenBao and load
only the LiteLLM/OpenBao server references required by the test process.

## Still owned by Phase 10

- repeat the browser journey through the clean pilot Keycloak hostname and public TLS;
- prove registry outage/recovery with operator-owned versioned images;
- execute external PostgreSQL/MinIO/Keycloak backup and restore with the agreed retention policy;
- attach final image digests, security review, and Product Owner/Ops/Security sign-off.
