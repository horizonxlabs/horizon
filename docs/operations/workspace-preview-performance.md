# Workspace preview startup

The workspace keeps its project volume, including private dependencies and `.next` cache,
across stop/start and container replacement. CPU allocation is unchanged.

## Dependency reuse

The image pins `templates/nextjs-base/package-lock.json` and installs with `npm ci`.
`workspace-dependencies.cjs` fingerprints dependency declarations, install hooks, the resolved
lock graph, npm configuration and Node ABI/platform/architecture. Name, description, formatting
and ordinary dev/build script changes do not invalidate dependencies. A successful install writes
its stamp **after** npm updates the lockfile; failed installs stop startup visibly.

The baseline stays linked to image dependencies. Customized dependency trees stay in the
project volume. Older checksum stamps migrate with a one-time install if a current dependency
fingerprint cannot be established. Do not remove `.next` or `node_modules` during image rollout.

## Active workspaces

Preview-session renewal marks project activity, including while Docs/Code is selected.
The existing 30-minute idle policy still applies after the workspace is closed.
Healthy running containers remain attached across platform image releases; stopped or failed
runtimes adopt the new image on recovery. For an urgent image/security rollout, set
`EVCP_WORKSPACE_FORCE_IMAGE_UPGRADE=1` on platform-api; the next recovery replaces old images.

## Prewarming and bundler

After its HTTP listener opens, the workspace requests its actual preview base path to compile
the first app page. Modern readiness observes this startup phase without compiling a separate
health route first. Old images retain HTTP health checks. Post-turn runtime probes already
request the app and now allow 45 seconds for compilation before treating it as indeterminate.
An app render error is distinct from a server startup failure and does not trigger destructive
recreation of an otherwise running workspace.

Next.js 15+ uses Turbopack in dev where the dependency layout supports it. The golden template
sets Turbopack's root to include the image dependency symlink. Existing configs that do not
support that root keep Webpack when using linked dependencies. `EVCP_WORKSPACE_BUNDLER=webpack`
on a workspace restores the previous bundler. Production builds continue using `next build`.
No experimental Next.js 15 persistent Turbopack cache is enabled; keeping active containers
preserves its in-memory cache, while project disk caches remain available across restarts.

## Visible progress

`GET /projects/:projectId/workspace/startup` authorizes project access and exposes only a known
phase, never raw process output. The UI polls while its loading overlay is mounted, stops on
load/unmount and preserves the existing iframe when switching tabs. Statuses report dependency
preparation, server startup, first compilation and browser asset loading; elapsed time alone
never advances a stage.

## Live updates after generation

The API must forward WebSocket upgrades at `/preview/:key/_next/webpack-hmr`, including
Turbopack connections. Express HTTP handlers alone serve the initial HTML but cannot carry
the live update stream. That leaves the iframe on the template even after generation completes;
manual refresh appears to fix it because that makes a new HTTP request.

`preview-websocket-proxy.ts` registers on the actual Nest HTTP server. It resolves the same
preview cookie and project authorization as HTTP, rejects cross-origin browser handshakes,
rewrites physical preview keys to the attached base path, and strips platform credentials
before opening the upstream connection. Live sockets close on application shutdown.
The iframe stays mounted across tab changes and commits; no periodic full reload is needed.

Regression command:

```sh
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json EVCP_ALLOW_SIMULATE_LOGIN=1 node --import tsx --test tests/unit/preview-websocket-proxy.test.mjs tests/unit/workspace-preview-proxy.test.mjs
```

Browser verification must go through `createPlatformApiApp`, not a substitute development
proxy: load the template, replace the page, confirm it updates without refreshing, enter a
draft, hide the iframe, run the isolated workspace build, edit again, and verify the new
heading and original draft on returning to Preview.

## Validation

Local Docker baseline, 1 CPU / 2 GiB, same fresh template image, sequential runs:
Turbopack 7.41 seconds from dependency check to first-page ready; Webpack 8.01 seconds.
Both reused dependencies without installation. These are local template measurements, not a
production speed guarantee for every generated project. Browser verification through an HTTP
and WebSocket preview proxy preserved input state while a hidden iframe received Hot Reload.
