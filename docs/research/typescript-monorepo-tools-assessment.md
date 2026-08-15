# Horizon TypeScript Monorepo Assessment

Date: 2026-08-15

Implementation status updated: 2026-08-15

## Executive conclusion

Horizon **partially follows** the architecture described by [monorepo.tools/typescript](https://monorepo.tools/typescript). It already has the important `apps/*` + `packages/*` separation, a pinned pnpm workspace, explicit `workspace:*` dependencies, and internal packages consumed as real workspace packages rather than TypeScript aliases.

It currently implements the site's **Workspaces + direct TypeScript source export** model, not the more scalable **Workspaces + TypeScript Project References + incremental/cached task graph** model. That is valid for private internal packages, but every repository-wide build/typecheck is still broadly rerun.

## Current-state comparison

| Area                           | Horizon evidence                                                                                                                                                                                                                               | Assessment                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package layout                 | `pnpm-workspace.yaml` includes `apps/*` and `packages/*`; deployable apps and shared libraries are separated                                                                                                                                   | **Good**                                                                                                                                                                                           |
| Package manager/workspaces     | Root pins `pnpm@11.7.0`; lockfile exists; all internal dependencies inspected use `workspace:*`                                                                                                                                                | **Good**. pnpm guarantees `workspace:` resolves to a local workspace package or fails, avoiding accidental registry resolution.                                                                    |
| Internal package entry points  | Shared packages are private and expose `src/index.ts`/`src/index.tsx` through `main` and `types`; applications use package imports such as `@evcp/types`                                                                                       | **Acceptable for internal direct-source packages**, which monorepo.tools explicitly describes as valid when libraries will never be published.                                                     |
| Package exports                | Every shared package defines `package.json#exports`; `@evcp/ui` explicitly exposes both `.` and `./styles.css`                                                                                                                                 | **Good**. Public entry points are explicit while the packages remain direct-source and private.                                                                                                    |
| Path aliases                   | App tsconfigs use `@/*` only for files inside each app. Workspace packages are not mapped through root `paths`; the Creator alias required by tests is isolated in `tsconfig.test.json`.                                                       | **Good**. The root `tsconfig.json` is neutral and the test-only alias no longer affects the whole workspace.                                                                                       |
| Project references             | Root and package tsconfigs contain no `references`; the shared config has no `composite` or `incremental`, and uses `noEmit: true`                                                                                                             | **Missing**. TypeScript cannot use `tsc -b` to order projects, reuse declaration outputs, or skip up-to-date referenced projects.                                                                  |
| Build orchestration            | Root uses pnpm recursive scripts across `packages/*` and `apps/*`                                                                                                                                                                              | **Basic**. pnpm recursive execution is topologically sorted by default, so dependency order exists, but there is no declared task-output graph, local/remote cache, or affected-project execution. |
| Dependency graph/boundaries    | Workspace dependencies provide a package graph. The workspace quality gate enforces `workspace:` links, rejects dependency cycles, rejects shared-package dependencies on applications, and frontend checks enforce feature/shared boundaries. | **Good for the current package graph**. It is not yet used for affected task execution.                                                                                                            |
| Typecheck/incremental practice | Every workspace has a `typecheck` script using `tsc --noEmit`; the root recursively runs them. No `.tsbuildinfo` strategy or solution build was found.                                                                                         | **Correct but non-incremental**. It gives isolated package checks but pays repeated work and cannot reuse project-reference state.                                                                 |
| Cache/affected execution       | No Nx, Turborepo, Rush, or equivalent task cache configuration was found                                                                                                                                                                       | **Missing at monorepo scale**. monorepo.tools identifies local/remote cache and affected detection as core capabilities for avoiding repeated tasks.                                               |

## Recommended checklist

### Keep

- [x] Keep `apps/*` for deployables and `packages/*` for reusable modules.
- [x] Keep the pinned pnpm version, lockfile, and `workspace:*` dependencies.
- [x] Keep `@/*` aliases scoped to a single app; do not map `@evcp/*` packages through TypeScript `paths`.
- [x] Keep one intentional root import per shared package; declare any supported subpath explicitly.

### Improve next

- [x] Add `exports` to every shared package, including explicit `types`/source targets and `@evcp/ui`'s `./styles.css` subpath.
- [x] Turn the root `tsconfig.json` into a neutral config and isolate the Creator test alias in `tsconfig.test.json`.
- [ ] Decide deliberately between:
  - direct-source packages plus a graph-aware task runner/cache; or
  - composite packages producing declarations plus root `tsc -b` project references.
- [ ] If adopting project references, enable `composite` in referenced packages, define declaration/build-info outputs, add explicit references matching workspace dependencies, and verify editor performance before applying it to very large generated types.
- [ ] Add cached task orchestration with declared inputs/outputs and dependency-aware `build`, `typecheck`, and `test` tasks.
- [ ] Add affected-project execution in CI, while retaining a periodic/full repository verification gate.
- [x] Enforce workspace protocol usage, package dependency cycles, and the shared-package-to-application boundary.

## Important interpretation

monorepo.tools presents path aliases, workspaces, and project references as progressively stronger strategies, not as a formal compliance standard. Therefore, the accurate answer is not simply yes/no:

- **Yes:** Horizon is a real pnpm TypeScript workspace and follows the recommended workspace-package approach.
- **Not yet:** Horizon does not use project references, composite/incremental solution builds, cached orchestration, or dependency-based affected execution.

## Primary sources

1. [monorepo.tools — TypeScript Monorepos](https://monorepo.tools/typescript): package structure; limitations of path aliases; workspaces; direct source exports versus prebuilt packages; project references; benchmark and incremental-build discussion.
2. [TypeScript Handbook — Project References](https://www.typescriptlang.org/docs/handbook/project-references.html): references split programs into smaller pieces; referenced projects require `composite`; `tsc -b` detects up-to-date projects and builds out-of-date projects in dependency order.
3. [TypeScript Modules Reference — `paths`](https://www.typescriptlang.org/docs/handbook/modules/reference.html#paths): `paths` does not change emitted imports; it should not point to monorepo packages because it bypasses normal package resolution, including `package.json#exports`; workspaces are recommended instead.
4. [TypeScript TSConfig — `incremental`](https://www.typescriptlang.org/tsconfig/incremental.html): incremental compilation persists project graph information in `.tsbuildinfo` files.
5. [pnpm — Workspaces](https://pnpm.io/workspaces): `pnpm-workspace.yaml` defines a workspace; `workspace:` guarantees resolution to a local workspace package.
6. [pnpm — Recursive](https://pnpm.io/cli/recursive): recursive package execution is topologically sorted by default.
7. [Node.js — Package entry points](https://nodejs.org/api/packages.html#package-entry-points): `exports` is recommended for new packages, defines public entry points, supports conditions, and encapsulates undeclared subpaths.
8. [monorepo.tools — Home](https://monorepo.tools/): local/remote caching, affected detection, distributed execution, and task splitting as monorepo capabilities.
