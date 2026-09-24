# Self-hosted GitHub Actions runners

All three workflows (`ci.yml`, `workflow-sanity.yml`, `release.yml`) run on self-hosted
runners. This runbook covers what a runner host must provide and how to point the
workflows somewhere else without editing them.

## Runner selection

Labels are not hardcoded. Each job resolves its runner from a repository variable with a
self-hosted default:

| Variable | Default | Used by |
| --- | --- | --- |
| `CI_RUNNER_LABELS` | `["self-hosted", "linux"]` | CI quality gate, workflow sanity, release build-and-test |
| `RELEASE_RUNNER_LABELS` | `["self-hosted", "linux", "x64"]` | Release publish (image build, sign, upload) |

`self-hosted`, `linux` and `x64` are labels GitHub applies to every runner automatically
based on its OS and architecture, so a plain runner registration matches with no custom
label configuration.

Both variables take a **JSON array**. Set them under *Settings → Secrets and variables →
Actions → Variables*:

```
CI_RUNNER_LABELS   ["ubuntu-latest"]
```

That is the escape hatch. If the runner fleet is offline, queued jobs wait for a runner
that will never come and CI appears to hang rather than fail. Setting the variable to
`["ubuntu-latest"]` moves every affected job back onto GitHub-hosted runners with no
commit, no PR and no review. Delete the variable to go back.

A malformed value fails the job at startup with a `fromJSON` error — the value must be a
JSON array, not a bare string.

## Release builds must be x86-64

`RELEASE_RUNNER_LABELS` is separate from `CI_RUNNER_LABELS` on purpose. The publish job
builds the images operators deploy to x86-64 private servers, and `docker build` without
an explicit `platforms:` produces images for whatever architecture the builder happens to
be. An arm64 runner would publish arm64 images under the normal release tags, and the
first sign of trouble would be an `exec format error` on the customer's host, long after
the release was signed and announced.

The `x64` label is only a scheduling hint — it can be applied by hand to a runner of any
architecture — so the publish job also asserts `uname -m` before building and fails
immediately if it is not `x86_64`.

## Required host packages

GitHub-hosted images ship a large preinstalled toolchain. A self-hosted host has only what
its operator installed, and the workflows check for the tools they depend on up front
rather than failing halfway through.

**All runners:** `git`, `curl`, `tar`, `sha256sum` (coreutils).

Node.js and pnpm are **not** required on the host — `actions/setup-node` and
`pnpm/action-setup` install them per job. Neither are actionlint and shellcheck, which
`workflow-sanity.yml` downloads itself.

**Do not leave an old Node.js on the runner's `PATH`.** The first self-hosted run failed
here: the host carried a pre-`node:`-protocol Node, `pnpm/action-setup`'s self-installer
ran under it, and the job died with `Cannot find module 'node:path'` before reaching any
repository code. The workflows now run `actions/setup-node` *before* `pnpm/action-setup`
so a known-good Node is on `PATH` first, but a stale system Node remains a trap for any
step that shells out to `node` or `npm` directly.

That ordering is also why the workflows no longer use `actions/setup-node`'s `cache: pnpm`
option — it resolves the store with `pnpm store path` and therefore needs pnpm to already
be installed. An explicit `actions/cache` step keyed on `pnpm-lock.yaml` replaces it.

**Release runners additionally need `docker` (with the `buildx` plugin) and `gh`.** The
runner user must be able to reach the Docker daemon — usually membership in the `docker`
group. Note that this grants effective root on the host; keep release runners off shared
hardware.

On Debian/Ubuntu:

```bash
sudo apt-get install -y git curl tar coreutils gh
# docker + buildx per https://docs.docker.com/engine/install/
sudo usermod -aG docker "$(whoami)"
```

## The runner must be able to bind-mount its own workspace

Parts of the integration suite shell out to `docker run -v <workspace path>:...` —
`tests/integration/publish-subdomain-proxy.test.mjs` mounts `docker/Caddyfile` into a
`caddy` image to adapt and assert the real routing config, and the live database tests
start a real PostgreSQL.

If the runner is a container with `/var/run/docker.sock` mounted in, those bind mounts
resolve **on the daemon's host, not inside the runner container**, and the paths do not
line up:

```
docker: Error response from daemon: mounts denied:
The path /_work/horizon/horizon/docker/Caddyfile is not shared from the host
and is not known to Docker.
```

The same mismatch hits published ports: `docker run -p 127.0.0.1::5432` publishes on the
daemon's host, so `127.0.0.1:<port>` inside the runner does not reach it.

There are three ways out, in order of preference:

1. Run the runner directly on a Linux host with a native Docker daemon, rather than in a
   socket-mounted container.
2. Keep the socket mount, but make the runner's `_work` directory the *same absolute path*
   on the host and in the container, so bind mounts resolve identically on both sides.
3. On Docker Desktop, add the runner's `_work` path under Settings → Resources → File
   Sharing. This is the weakest option — it is host-local configuration that no one else
   can reproduce.

### What was changed in the tests, and what was not

The two Caddy tests were made portable rather than conditional: `adaptCaddyfile` pipes the
config in on stdin instead of bind-mounting it, so they run everywhere and still fail on a
real regression. No coverage was given up.

`project-database-lock-live.test.mjs` could not be fixed that way — it opens two concurrent
connections through the platform's own `pg-runner`, so routing it through `docker exec psql`
would stop testing the code it exists to test. It instead distinguishes the two failure
modes: if Postgres logs that it is ready but its port is unreachable, the test skips with
that reason; if the container genuinely fails to boot, it still fails. Both branches were
verified by mutation, along with the fact that it still *runs* where the daemon is local.

**This is a real, if narrow, loss of coverage on socket-mounted runners.** That test does
not execute there, and the skip is easy to miss in a green build. It is a deliberate
trade to keep releases moving, not a fix — options 1 and 2 above remove the need for it.
Do not extend the same pattern to other tests to make them go quiet.

## Housekeeping

`actions/checkout` runs `git clean -ffdx` when a workspace already exists, so
`node_modules`, `.next` and other build output are wiped between jobs — the workspace does
not accumulate. Docker does accumulate: build cache and dangling images on a release
runner grow without bound. Prune it on a schedule you control rather than from inside the
workflow, so a running build is never pulled out from under itself:

```bash
docker buildx prune --filter until=168h --force
docker image prune --filter until=168h --force
```

## Security notes

- This repository is private, so pull requests cannot originate from forks. That matters:
  running fork PRs on a self-hosted runner lets an outside contributor execute arbitrary
  code on your hardware. **If the repository is ever made public, `ci.yml` must gate the
  `pull_request` trigger before the fleet is exposed.**
- Self-hosted runners are not clean-room environments. Anything a job writes outside the
  workspace persists for the next job, including the next repository's. The workflows
  avoid this where they can: `workflow-sanity.yml` unpacks actionlint into `RUNNER_TEMP`
  rather than `sudo install`-ing it into `/usr/local/bin`.
- `docker/login-action` removes the GHCR credentials it wrote to `~/.docker/config.json`
  in its post-job step. Do not disable that on a persistent host.
