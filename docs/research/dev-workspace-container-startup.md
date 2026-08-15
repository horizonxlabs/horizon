# Faster Horizon development-workspace startup

Date: 2026-08-15

## Decision

Keep one Docker container per project, but stop using Docker's empty-volume copy-up as the project seeding mechanism. Horizon should mount a **source-only** project volume with `volume-nocopy`, keep the fixed baseline dependencies in the image outside that mount, and seed only the small golden-template source into the volume. In parallel, make Postgres, object-storage, and LiteLLM-key provisioning concurrent and batch the six secret writes.

This is the best near-term option because it attacks both measured bottlenecks without weakening Horizon's per-project filesystem, process, resource, and secret boundaries. A stopped-container pool, filesystem snapshots, or a sandbox vendor can be evaluated later, but none should be the first fix.

## What is slow today

### Measured locally

These observations are from the current local Docker Desktop environment. They are measurements, not vendor performance claims.

| Segment | Observed time |
| --- | ---: |
| `project.created` to first chat, fresh projects (2 samples) | 21.358 s, 23.161 s |
| `project.created` to Docker container `Created` | 15.782 s, 15.666 s |
| Container `Created` to health/first chat | 5.576 s, 7.495 s |
| Fresh container `Created` to `Started` (1 sample) | 4.731 s |
| Next.js process `Starting` to `Ready`, fresh | about 1.1–1.2 s |
| Existing stopped container `Started` to Next.js `Ready` (warm) | about 1.73 s |

The fresh named project volumes observed locally are about 657–660 MB. In a representative fresh workspace, `/workspace/node_modules` alone is 646.3 MB. The workspace image is 674,890,079 bytes. Its history also shows a large `npm install` layer and another ownership-changing layer created by `chown -R`.

The evidence says:

1. **Next.js itself is not the dominant startup cost.** It becomes ready in roughly 1.1 seconds.
2. **About 16 seconds happen before Docker creates the container.** The orchestrator serially provisions Postgres, object storage, and a LiteLLM key, then performs six sequential secret writes before volume/container creation ([orchestrator.ts](../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts#L246-L281)).
3. **A fresh Docker create/start spends several seconds copying the baseline workspace.** The image installs dependencies under `/workspace` ([workspace-next.Dockerfile](../../docker/workspace-next.Dockerfile#L12-L29)), while each new named volume is mounted over all of `/workspace` ([docker-engine.ts](../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts#L20-L48)). Docker documents that mounting an empty volume over a non-empty image directory copies that directory into the volume by default; `volume-nocopy` disables it.[^docker-volumes]
4. **Warm wake-up is already good.** Horizon stops and later starts the same per-project container ([orchestrator.ts](../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts#L323-L342)); the retained volume and install stamp skip dependency installation ([workspace-entrypoint.sh](../../docker/workspace-entrypoint.sh#L11-L22)). A global prewarm pool would mostly improve first creation, not the common warm wake path.

The readiness loop polls only once per second ([workspace-lifecycle.ts](../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts#L36-L47)), so it can add almost one second of avoidable detection delay after the server is actually ready.

## Prioritized recommendation

### P0 — instrument the critical path

Add duration spans around persisted-record creation, Postgres provisioning, bucket provisioning, LiteLLM key creation, secret persistence, volume creation, container creation, container start, process ready, and first successful health request. Record cold/warm and image/manifest identity.

Use p50/p95, not a single workstation sample, as the release gate. Suggested targets after P1:

- existing stopped workspace to preview-ready: p95 under 3 s;
- fresh workspace container create/start to preview-ready: p95 under 4 s on a node with the image cached;
- whole fresh workspace provisioning: p95 under 8 s, excluding upstream model response.

### P1 — parallelize independent infrastructure work

Run these independent operations concurrently:

- Postgres schema/role creation;
- MinIO bucket/credentials creation;
- LiteLLM virtual-key creation.

After all three settle successfully, persist the six project secrets concurrently or add a single atomic `putMany` operation. Preserve rollback correctness: use an all-settled pattern, register every successful resource, and start rollback only after all in-flight operations have settled. A naïve early-rejecting `Promise.all` can race rollback against an operation that is still creating a resource.

This directly addresses the measured ~15.7 seconds before container creation. Also allow the Pi planning/model phase to overlap workspace boot when it does not need workspace files yet; block only filesystem tools, validation, and preview on readiness.

### P1 — replace full-workspace copy-up with a source-only volume

Use a layout such as:

```text
/opt/evcp/template/          immutable golden source in image
/opt/evcp/deps/node_modules immutable, fixed baseline dependencies in image
/workspace/                  per-project named volume, source and Git only
/workspace/node_modules     symlink to /opt/evcp/deps/node_modules
```

Create the `/workspace` mount using the Engine API `Mounts` form with `VolumeOptions.NoCopy`, rather than the current legacy `Binds` form. On a genuinely empty source volume, copy only the golden source (currently a tiny fraction of `node_modules`) from `/opt/evcp/template`, create the dependency symlink, initialize Git, and start Next with the baseline binary. Docker explicitly supports `volume-nocopy` to suppress empty-volume propagation.[^docker-volumes] The Moby Engine API exposes `VolumeOptions.NoCopy` for volume mounts.[^moby-api]

This design fits the current product because the generated template's dependency manifest is locked. If Horizon later permits arbitrary dependency changes, do **not** make a shared writable `node_modules` tree. Instead use:

- a per-project dependency overlay/volume for additions;
- a shared package-download/content-addressable cache scoped to mutually trusted builds;
- a committed lockfile and deterministic install.

pnpm documents that package files are hard-linked from a content-addressable store into each project's virtual store.[^pnpm-layout] Its Docker guidance recommends BuildKit cache mounts and explicitly warns that a store writable by an untrusted build must not be reused by trusted builds.[^pnpm-docker] That makes a shared cache reasonable, but a shared writable installed tree unsafe across tenants.

Keep disposable outputs out of the durable source volume where practical. In particular, `.next` can use a separate per-container disposable volume. This keeps project persistence small and prevents build caches from dominating backup, clone, and cleanup cost.

### P1 — tighten readiness and image construction

- Poll local health every 100–250 ms with backoff instead of one second, or make the entrypoint signal readiness to the orchestrator.
- Commit the template lockfile and install deterministically during image build. The entrypoint should not run an install when the locked baseline is unchanged.
- Build as the `evcp` user or use `COPY --chown`, rather than installing as root and then `chown -R` over hundreds of megabytes. Docker's Dockerfile reference states that `COPY --chown` sets ownership as files are copied.[^dockerfile]
- Rebuild the workspace image in local setup only when its Dockerfile, entrypoint, template, or lockfile content hash changes. The current setup invokes the workspace build on every full dev startup ([setup.mjs](../../scripts/dev/setup.mjs#L86-L89)); BuildKit will cache unchanged layers, but skipping the command avoids needless setup work.
- Prebuild and publish the workspace image by immutable digest. Pre-pull it onto execution nodes during deployment. Dev Containers likewise recommends prebuilt images specifically for faster startup, pinned tools, and avoiding a fresh build on each machine.[^devcontainers]
- Use BuildKit cache mounts for the npm/pnpm download cache while building the image. Docker documents that cache mounts persist package caches across builds and download only changed packages; external cache can share build cache across builders.[^build-cache]

Image pre-pull and BuildKit caching improve node/setup cold starts, but they do not fix the current 660 MB per-project volume copy because the image is already local in the measured case.

### P2 — make container writable layers disposable and source external

The fastest Docker design is to run directly on the image's copy-on-write container layer with no `/workspace` data volume, then make an external Git/object-store repository the durable source of truth. Fresh container creation no longer copies the dependency tree; recovery restores only source and Git metadata.

This is a larger architecture change. Horizon currently keeps the project's Git repository inside the workspace volume, so deleting a container without a durable external mirror would lose work. Implement source mirroring/checkpoint recovery before considering this option. The source-only named-volume design is the safer intermediate step.

## Options compared

| Option | Cold-start impact | Warm impact | Isolation / operations | Recommendation |
| --- | --- | --- | --- | --- |
| Source-only `volume-nocopy` + image dependencies | Removes the measured full `node_modules` copy; only tiny source seed remains | Same or better | Preserves current per-project container boundary | **Do first** |
| Parallel resource provisioning + batched secrets | Attacks the measured ~15.7 s pre-container segment | No material effect | Small implementation change; rollback needs care | **Do first** |
| Existing stopped per-project container | N/A for first creation | Already ~1.73 s to Next ready | Releases CPU but preserves disk/container identity | **Keep** |
| Pre-created stopped-container/volume pool | Hides copy/provisioning by paying it ahead of demand | Fast claim | Each current pool slot costs ~660 MB; Docker container env is fixed at create, so secure project secrets complicate claiming | Only after P1 and only if p95 still misses target |
| Small running/paused LRU | No first-create benefit unless pooled | Near-instant recent-session return | Consumes memory; pausing does not release the process memory | Optional for premium/recent sessions |
| Shared read-only baseline `node_modules` | Similar benefit to source-only layout | Fast | Safe only for the locked common dependency set | Use as part of P1 |
| Shared writable `node_modules` | Can avoid installs | Fast | Cross-project mutation, lifecycle-script, race, and version-contamination risk | **Do not use** |
| Shared pnpm store/cache | Speeds changed-manifest installs, not process boot by itself | Helps repair/rebuild | Scope caches by trust boundary per pnpm guidance | Use for allowed dependency installs |
| Docker local-volume tar clone | Still copies hundreds of MB | N/A | Docker's documented portable backup/restore path is tar-based, not an instant local-volume snapshot/clone.[^docker-volumes] | Not worthwhile for this baseline |
| CSI/ZFS/Btrfs snapshot clone | Potentially very fast copy-on-write clone | N/A | Driver/platform-specific lifecycle and quotas | Consider only after moving to snapshot-capable Linux/Kubernetes storage |
| One runner container/process namespace for all projects | Avoids per-project Docker create | Fast | All generated apps share filesystem, secrets, cgroup, and compromise boundary | Local trusted opt-in only; never multi-tenant |
| Podman replacement | No architectural fix: Podman also documents initial volume copy-up semantics.[^podman] | Similar | Rootless operation may help host security, but migration adds work | Not a latency solution |

Docker recommends one service per container to preserve separation of concerns.[^docker-multiservice] For Horizon, this matters beyond style: Pi executes generated code and shell commands, so multiplexing unrelated projects in one container turns a project escape into cross-project access. A local-only `EVCP_LOCAL_FAST_UNSAFE=1` runner could be acceptable for one trusted developer, but it should be clearly non-production and not used for security testing.

## Sandbox and microVM alternatives

These are strategic alternatives, not a reason to delay the Docker P1 work.

### Daytona

Daytona snapshots capture filesystem/packages/settings, and its documented warm pools keep pre-created running sandboxes from a snapshot so a matching create request can claim one immediately.[^daytona] That directly productizes the pool Horizon would otherwise build. Evaluate it if Horizon wants to outsource multi-host sandbox scheduling, snapshot management, and warm capacity. Trade-offs are vendor/platform dependency, data residency, networking/preview integration, quota mapping, and replacing the current Docker socket adapters.

Daytona's pool matching rules are important for Horizon: its documentation requires a matching snapshot, region, default resources, and user, and excludes custom environment variables, volumes, and secrets; warm sandboxes also consume quota.[^daytona-pools] Horizon would therefore need to claim a generic sandbox and securely inject project state afterward, or maintain more narrowly scoped snapshots/pools.

### E2B

E2B supports pause/resume preserving filesystem and memory, and snapshots can spawn multiple sandboxes from the same state.[^e2b-persistence][^e2b-snapshots] Its official numbers say pause is approximately 4 s per GiB of RAM and resume approximately 1 s.[^e2b-persistence] E2B templates can capture a start command with its process already running; E2B recommends templates over snapshots for faster, more resource-efficient cold starts when the environment is declarative.[^e2b-templates][^e2b-snapshots]

This is attractive for hosted production elasticity, but local development gains a network/vendor dependency and Horizon would need new controls for secrets, egress, audit evidence, preview routing, regional residency, and cost.

### Firecracker

Firecracker provides KVM-backed microVM isolation and officially reports application-code startup in as little as 125 ms and up to 150 microVM creations per second per host.[^firecracker] It supports snapshot/restore, but the project warns that restore performance depends on memory/vCPU/device count, cgroups v1 has high restoration latency, network continuity is not guaranteed, and cloned snapshots can duplicate security-sensitive state unless uniqueness is handled correctly.[^firecracker-snapshots]

Firecracker is a Linux/KVM building block, not a drop-in Docker Desktop replacement on the current Mac development host. Adopting it means building or buying image, kernel, network, snapshot, scheduling, and observability control planes. Prefer Daytona/E2B or firecracker-containerd/Kata evaluation over writing a bespoke VMM orchestrator unless sandbox infrastructure becomes Horizon's core differentiator.

### WebContainers

WebContainers run Node.js and commands entirely in the browser and claim dev-environment startup in milliseconds.[^webcontainers] They are compelling for an instant **UI-only draft preview** while a server workspace provisions in parallel. They are not a full replacement for Horizon's governed server workspace: only one WebContainer instance can be booted per page, COOP/COEP cross-origin isolation is required, and full support is concentrated in Chromium browsers.[^webcontainers-quickstart][^webcontainers-browser]

A useful future hybrid is:

1. render the initial React/UI prototype in a WebContainer immediately;
2. provision Docker in the background;
3. switch to the authoritative Docker preview before database, secret, migration, validation, or publish operations.

Do not expose LiteLLM, database, S3, or tenant secrets to the browser runtime.

### Dev Containers

The Dev Container specification/CLI can prebuild and publish a configured image, which avoids building an environment afresh on a new machine.[^devcontainers] It is useful as an image-build convention and contributor workflow, but it does not provide Horizon's multi-tenant scheduler, secure claiming, idle lifecycle, reverse proxy, quota, or snapshot service. Adopt its prebuild ideas, not its CLI as the workspace orchestrator.

## Proposed experiment sequence

1. Add timing spans and capture 30 fresh + 30 warm starts on the same Docker Desktop host.
2. Parallelize the three resource providers and secret persistence; repeat measurements.
3. Build a source-only `volume-nocopy` prototype with the locked baseline dependency symlink; verify create, Pi edit, build, Git commit, stop/wake, platform restart recovery, archive/delete, and image upgrade.
4. Test 30 fresh starts and compare volume bytes, Docker create/start time, health-ready time, and first-page compile.
5. Only if fresh p95 remains above target, prototype a pool of **source-only seeded volumes** before a full stopped-container pool. Volume pools avoid binding project secrets into generic containers and will be much smaller after P1.
6. Separately benchmark E2B/Daytona with the same Next template only if production multi-host elasticity or stronger isolation is an active roadmap need.

## Primary sources

[^docker-volumes]: Docker Docs, [Volumes: mounting over existing data, `volume-nocopy`, and backup/restore](https://docs.docker.com/engine/storage/volumes/).
[^moby-api]: Moby source, [Docker Engine API `VolumeOptions.NoCopy` and volume endpoints](https://github.com/moby/moby/blob/master/api/swagger.yaml).
[^dockerfile]: Docker Docs, [Dockerfile reference: `COPY --chown` and cache-mount options](https://docs.docker.com/reference/dockerfile/).
[^build-cache]: Docker Docs, [Optimize cache usage in builds](https://docs.docker.com/build/cache/optimize/) and [cache backends](https://docs.docker.com/build/cache/backends/).
[^devcontainers]: Development Containers, [Prebuilding images](https://containers.dev/guide/prebuild).
[^pnpm-layout]: pnpm Docs, [Symlinked `node_modules` structure and content-addressable store](https://pnpm.io/symlinked-node-modules-structure).
[^pnpm-docker]: pnpm Docs, [Working with Docker: BuildKit caches and trust-boundary warning](https://pnpm.io/docker).
[^docker-multiservice]: Docker Docs, [Run multiple processes in a container](https://docs.docker.com/engine/containers/multi-service_container/).
[^podman]: Podman Docs, [`podman create`: volume `[no]copy` and overlay-rootfs behavior](https://docs.podman.io/en/latest/markdown/podman-create.1.html).
[^daytona]: Daytona Docs, [Snapshots and warm pools](https://www.daytona.io/docs/en/snapshots/).
[^daytona-pools]: Daytona Docs, [Warm-pool matching and quota](https://www.daytona.io/docs/en/warm-pools/).
[^e2b-persistence]: E2B Docs, [Sandbox persistence, pause/resume semantics and performance](https://e2b.dev/docs/sandbox/persistence).
[^e2b-snapshots]: E2B Docs, [Sandbox snapshots and templates comparison](https://e2b.dev/docs/sandbox/snapshots).
[^e2b-templates]: E2B Docs, [Custom sandbox templates and captured start commands](https://e2b.dev/docs/sandbox-template).
[^firecracker]: Firecracker project, [official overview and startup characteristics](https://firecracker-microvm.github.io/).
[^firecracker-snapshots]: Firecracker source, [snapshot support, limitations, and clone security](https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/snapshot-support.md).
[^webcontainers]: WebContainers Docs, [Introduction](https://webcontainers.io/guides/introduction).
[^webcontainers-quickstart]: WebContainers Docs, [Quickstart: one instance and cross-origin isolation](https://webcontainers.io/guides/quickstart).
[^webcontainers-browser]: WebContainers Docs, [Browser support](https://webcontainers.io/guides/browser-support) and [required COOP/COEP headers](https://webcontainers.io/guides/configuring-headers).
