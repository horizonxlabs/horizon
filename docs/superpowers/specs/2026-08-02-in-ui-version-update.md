# In-UI Version Update (B-sys + B3) — Design

**Status:** Draft for review.
**Date:** 2026-08-02
**Scope:** Sub-project B3 (Dokploy-style "update version" button in the Admin Console) plus the **B-sys** foundation it needs (platform-api managing its own swarm services via the Docker Engine API). Domain-via-UI (B2) is a later spec that reuses B-sys.

## Goal

From the Admin Console, an admin types a target release tag and clicks **Update**; the platform pulls the new images and rolls the whole stack to that version — including platform-api itself — with the UI surviving the self-restart (mirrors Dokploy's self-update). Version detection is manual (typed tag) in v1; auto-detect from the registry is a later increment.

## How Dokploy does it (reference)

`docker service inspect dokploy` for the current image; Docker Hub tags API + semver for the latest; then `docker service update --force --image dokploy/dokploy:<tag> dokploy` via the docker **CLI** in its container. **EVCP differs deliberately:** platform-api already talks to the Docker daemon through a raw socket HTTP client (`workspace-orchestrator/docker-socket-engine.ts`), so we extend that with swarm **service** calls instead of shelling out to a CLI — no `docker` binary added to the image, consistent with existing orchestration code, and unit-testable with a stubbed request function.

## Background

- platform-api runs on the single-node swarm manager (pinned), with `/var/run/docker.sock` mounted. `docker-socket-engine.ts` issues raw `nodeSocketRequest` calls (`/containers/*`). The Docker Engine API also exposes `/services/*` on the same socket.
- The stack is named `evcp`; app services are `evcp_platform-api`, `evcp_admin-web`, `evcp_creator-web`, `evcp_app-store-pwa`, `evcp_workspace-next-image`, all using `${EVCP_IMAGE_REPOSITORY}/evcp-<name>:${EVCP_VERSION}`. Infra services (postgres/redis/minio/keycloak/litellm/caddy/openbao) use pinned public images and are **not** version-bumped.
- `platform-api` knows `EVCP_IMAGE_REPOSITORY` and `EVCP_VERSION` from env. Its image CMD runs `prisma migrate deploy` on start, so a self-update migrates the DB automatically.

## Components

### 1. B-sys — `SwarmServiceEngine` (Docker Engine API over the socket)

New module `apps/platform-api/src/workspace-orchestrator/swarm-service-engine.ts` (same `nodeSocketRequest` pattern + injectable `request` for tests):
- `listStackServices(stack)` → `GET /services?filters={"label":["com.docker.stack.namespace=<stack>"]}` → `[{ id, name, image }]`.
- `updateServiceImage(serviceName, image)` → `GET /services/<name>` (read `.Version.Index` + `.Spec`), set `.Spec.TaskTemplate.ContainerSpec.Image = image` and `.Spec.TaskTemplate.ForceUpdate++`, then `POST /services/<name>/update?version=<index>` with the full spec. Returns `{ ok }` (or the Docker error).

Kept generic (image update by service) so B2 can reuse it. No knowledge of "versions" here.

### 2. B3 — system-update service + admin routes

New `apps/platform-api/src/system/system-update-service.ts`:
- `getSystemVersion()` → `{ currentVersion: EVCP_VERSION, imageRepository: EVCP_IMAGE_REPOSITORY, appServices: [{ name, image, tag }] }` (tags read via `SwarmServiceEngine.listStackServices("evcp")`).
- `updateToVersion(targetTag)`:
  - Validate `targetTag` (a plausible tag: `^[A-Za-z0-9][A-Za-z0-9._-]*$`).
  - App services to bump = the 5 `evcp-*` (a fixed allowlist mapping service → image name).
  - Update every app service EXCEPT `evcp_platform-api` first (await each).
  - Update `evcp_platform-api` **last, fire-and-forget** (do not await — the task will restart), returning `202 { accepted: true, targetVersion }` to the caller before the restart.
- Admin routes (require the `admin` role, like the other `/admin/*` routes):
  - `GET /admin/system/version` → `getSystemVersion()`.
  - `POST /admin/system/update` `{ version }` → `updateToVersion` → `202`.

**Status = derived, not stored.** Because platform-api restarts, progress is not kept in memory. The UI polls `GET /admin/system/version`: while the running `currentVersion` (or the platform-api service's image tag) ≠ target, it's "updating"; once it equals the target and all app services report the target tag, it's "done". A poll that fails during the restart window is treated as "still updating", and the client retries.

### 3. Admin Console UI — System / Version page

Under the existing `platform-operations` feature (or a small `System` panel): shows current version + each app service's tag; a text input for the target tag; an **Update** button (admin-only, confirm dialog "roll the stack to `<tag>`?"). On submit → `POST /admin/system/update` → shows an "Updating…" state that **polls `/admin/system/version`** (with retry-through-restart) until every app service reports the target tag, then "Updated to `<tag>`". Follows `@evcp/ui` primitives and the existing feature/hook/page layout.

## Data flow

Admin types tag → `POST /admin/system/update` → system-update-service updates the 4 non-self app services via `SwarmServiceEngine` (Docker API), then fire-and-forgets its own service update and returns 202 → swarm rolls each service to `<repo>/evcp-*:<tag>` → new platform-api boots, runs `prisma migrate deploy`, reports the new `EVCP_VERSION` → UI's poll sees the target tag everywhere → done.

## Error handling

- Invalid/empty target tag → `400`.
- Non-admin → `403` (same guard as other `/admin/*` routes).
- A service update the daemon rejects (bad tag, pull failure) → surfaced in the response for the non-self services (awaited); swarm keeps the old tasks running (no partial-broken state) and can roll back. The self-service failure can only be observed via the poll not converging — the UI shows "update did not complete" after a timeout.
- Docker socket unreachable → `503` with a clear message.

## Testing

- **Unit:** `SwarmServiceEngine` with a stubbed `request` — asserts the correct `GET /services?filters=…`, the read-modify-write of the spec (image + ForceUpdate + `?version=<index>`), and error propagation. `system-update-service` with a stubbed engine — asserts the app-service allowlist, that `platform-api` is updated **last and not awaited**, tag validation, and `getSystemVersion` shape.
- **Contract/route:** `GET /admin/system/version` and `POST /admin/system/update` require admin; 202 shape.
- **Render-smoke:** the new admin System page renders (extend the admin render-smoke harness).
- **Live (controller-run, gated):** on the local swarm running `evcp-local/*:test`, build a second tag `evcp-local/*:test2`, `POST /admin/system/update {version:"test2"}`, and confirm every app service (incl. platform-api after restart) converges to `:test2` and `/api/setup/status` still works. Teardown.

## Acceptance criteria

- An admin can update the whole app tier to a typed tag from the UI; platform-api updates itself last and the UI survives the restart via polling.
- Only the 5 `evcp-*` app services are bumped; infra untouched.
- DB migrations run automatically on the platform-api self-update.
- Admin-only; invalid input rejected; a bad tag leaves the running stack intact.
- Mechanism uses the Docker Engine API over the existing socket client — no docker CLI added to the image.

## Out of scope (later)

- Auto-detecting the latest version from GHCR/GitHub (needs a registry token) — v2.
- Rollback UI, changelogs, multi-node.
- Compose **structural** changes (new services/env): this bumps image tags only; a structural change still needs re-running `install.sh`/`bootstrap-swarm.sh` on the host. (Documented in the runbook.)
- Domain/TLS via UI (B2 — reuses `SwarmServiceEngine`).
