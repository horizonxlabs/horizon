# Users Management Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Redesign `/admin/users` into a management console consistent with the AI Providers console — own header, metrics, design-system DataTable, and drawers replacing all `window.prompt/confirm`. UI-only; the Keycloak user API is unchanged.

**Architecture:** Extract a `useKeycloakUsers(client)` hook (list + pagination + message/error + actions), then build presentational drawers/console on top using `@evcp/ui` primitives (`Drawer`, `Field`, `Input`, `Select`, `DataTable`, `MetricCard`, `DecisionPanel`, `Badge`/`StatusPill`, `PageHeader`, `Button`). Wire into `AdminConsole` routing.

## Global Constraints
- Design-system only: `@evcp/ui` primitives + Tailwind tokens; no app-local CSS/hardcoded colors. Files ≤ 400 lines.
- No `window.prompt` / `window.confirm` — all interactions via Drawer + in-drawer confirm.
- Keep the existing pure helpers `buildCreateUserPayload`/`generateTempPassword`/`CreateUserForm` exported from `features/user-management/index.ts` (tests `admin-users-ui.test.mjs` depend on them).
- Keycloak client (via `createKeycloakUserClient`): `list({first,max})→{users,meta}`, `create(CreateKeycloakUserInput)→KeycloakUserDto`, `update(id,{email,name})→KeycloakUserDto`, `setEnabled(id,bool)→KeycloakUserDto`, `setRole(id,role)→KeycloakUserDto`, `resetPassword(id,tempPw)→void`, `listSessions(id)→PlatformSessionSummary[]`, `revokeSessions(id)→{id,revoked}`.
- `KeycloakUserDto = { id, email, name, enabled, groups[], createdAt? }`; role derived from groups: `evcp-admins`→admin, `evcp-users`→end_user, else creator. `CreateKeycloakUserInput.role: "admin"|"creator"|"end_user"`.
- Tests: `node --import tsx --test tests/<suite>/<file>.test.mjs`. Work in the dallas worktree on `main-v1`.

---

### Task 1: `useKeycloakUsers` hook + role/summary helpers
**Files:** Create `apps/admin-web/src/features/user-management/use-keycloak-users.ts`; create `apps/admin-web/src/features/user-management/lib/user-derivations.ts`; Test `tests/unit/user-derivations.test.mjs`.
**Interfaces — Produces:**
- `roleOf(user: KeycloakUserDto): "admin"|"creator"|"end_user"` (from groups).
- `roleCounts(users): { total:number; admin:number; creator:number; end_user:number }`.
- `useKeycloakUsers(client): { users, meta, page, setPage, message, error, reload, createUser, updateUser, changeRole, setEnabled, resetPassword, listSessions, revokeSessions }` — each action calls the keycloak client, refreshes the list, sets `message` on success / `error` on failure (mirror today's `perform` pattern in `KeycloakUserManagement.tsx`). pageSize 10.

- [ ] Step 1: Write `tests/unit/user-derivations.test.mjs` — assert `roleOf` maps groups correctly and `roleCounts` tallies. RED.
- [ ] Step 2: Implement `lib/user-derivations.ts` (pure). GREEN.
- [ ] Step 3: Implement `use-keycloak-users.ts` extracting the state/actions from `KeycloakUserManagement.tsx` (list, page, message, error, and the 7 actions each wrapping the client call + `reload()` + message/error). Keep behavior identical.
- [ ] Step 4: `pnpm typecheck` clean; derivations test passes.
- [ ] Step 5: Commit `feat(admin): useKeycloakUsers hook + user derivations`.

### Task 2: AddUserDrawer
**Files:** Create `apps/admin-web/src/features/user-management/AddUserDrawer.tsx`.
**Interface:** `AddUserDrawer({ open, onClose, users, onDone })` where `users = ReturnType<typeof useKeycloakUsers>`. Fields: email, name, role (`Select`: Admin/Creator/End user), temporary password (`Input type=password` + a small "Generate" `Button` using `generateTempPassword`). Submit → `users.createUser({email,name,role,temporaryPassword})`; on success `onDone(msg)` + close; on failure show inline error. Mirror `drawers/ProviderDrawer.tsx` structure.
- [ ] Implement; `pnpm typecheck` + `check:design-system` clean; file ≤400. Commit `feat(admin): add-user drawer`.

### Task 3: UserSessionsPanel (in-drawer sessions + revoke confirm)
**Files:** Create `apps/admin-web/src/features/user-management/UserSessionsPanel.tsx`.
**Interface:** `UserSessionsPanel({ user, users })`. Button "View sessions" → `users.listSessions(user.id)` → render a small table (Session id, Issued, Expires, Status) using `Table`/`THead`/`TRow`/`TCell`. "Revoke all sessions" shows an in-component confirm state (`Revoke all? [Confirm][Cancel]` buttons, `Button variant="danger"`) → `users.revokeSessions(user.id)` then refresh sessions. Format dates with a local helper (reuse `formatSessionDate` from the old file). No `window.confirm`.
- [ ] Implement; typecheck + design-system clean; ≤400. Commit `feat(admin): user sessions panel with in-drawer revoke confirm`.

### Task 4: ManageUserDrawer
**Files:** Create `apps/admin-web/src/features/user-management/ManageUserDrawer.tsx`.
**Interface:** `ManageUserDrawer({ open, onClose, user, users, onDone })`. Sections (each with its own submit, mirroring drawer/Field patterns):
- Profile: name, email `Input`s → `users.updateUser(user.id,{name,email})`.
- Role: `Select` (current role default) → `users.changeRole(user.id, role)`.
- Status: `Button` toggling `users.setEnabled(user.id, !user.enabled)` (label Enable/Disable).
- Reset password: `Input type=password` → `users.resetPassword(user.id, pw)`.
- `<UserSessionsPanel user={user} users={users} />`.
Each action calls `onDone(msg)` on success. If the file approaches 400 lines, keep sections tight; sessions already split out (Task 3).
- [ ] Implement; typecheck + design-system clean; ≤400. Commit `feat(admin): manage-user drawer`.

### Task 5: UsersConsole
**Files:** Create `apps/admin-web/src/features/user-management/UsersConsole.tsx`.
**Interface:** `UsersConsole({ client })`. Composition: instantiate `const users = useKeycloakUsers(client)`; own `PageHeader` (eyebrow "Identity", title "Users", description) + top-right `+ Add user`; `roleCounts` → 4 `MetricCard`s; `DecisionPanel` for `users.message`/`users.error`; `DataTable`/`Table` of users (User = name+email, Status = enabled `StatusPill`, Role = `Badge` via `roleOf`, Manage `Button` per row opening ManageUserDrawer for that user); Previous/Next pagination via `users.page`/`meta.total`. `AddUserDrawer` + `ManageUserDrawer` wired with open state (+ selected user). onDone → message shown via DecisionPanel.
- [ ] Implement; typecheck + design-system clean; ≤400. Commit `feat(admin): users management console`.

### Task 6: Wire routing + tests + cleanup
**Files:** Modify `apps/admin-web/src/features/user-management/index.ts` (export `UsersConsole`; keep creation-helper exports; drop `KeycloakUserManagement` export); Modify `apps/admin-web/src/features/admin-console/AdminConsole.tsx` (route `users` → `<UsersConsole client={client} />`; add `users` to the header-suppression condition); delete `KeycloakUserManagement.tsx`; update `tests/unit/admin-user-management-feature.test.mjs` if it referenced the old component; extend `tests/unit/admin-web-render-smoke.test.mjs` to render `UsersConsole` with a stub client (assert "Users" in HTML).
- [ ] Confirm `admin-users-ui.test.mjs` (creation helpers) still passes untouched.
- [ ] `pnpm check` ALL PASS. Live-verify: add user, manage (edit/role/enable/disable/reset), view+revoke sessions.
- [ ] Commit `feat(admin): route Users console and retire legacy user management`.
