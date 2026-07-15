import { createKeycloakUserClient, type CreateKeycloakUserInput, type KeycloakUserDto, type PlatformApiClient, type PlatformSessionSummary } from "@evcp/api-client";
import { DecisionPanel, SectionCard, Select } from "@evcp/ui";
import { useEffect, useState } from "react";

type UserDraft = CreateKeycloakUserInput;
const emptyDraft: UserDraft = { email: "", name: "", role: "creator", temporaryPassword: "" };

function userRole(user: KeycloakUserDto): UserDraft["role"] {
  if (user.groups.includes("evcp-admins")) return "admin";
  if (user.groups.includes("evcp-users")) return "end_user";
  return "creator";
}

export function KeycloakUserManagement({ client }: { client: PlatformApiClient }) {
  const keycloak = createKeycloakUserClient(client);
  const [users, setUsers] = useState<KeycloakUserDto[]>([]);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sessionUser, setSessionUser] = useState<KeycloakUserDto>();
  const [sessions, setSessions] = useState<PlatformSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const pageSize = 10;

  const load = async () => {
    try { const result = await keycloak.list({ first: page * pageSize, max: pageSize }); setUsers(result.users); setTotal(result.meta.total); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load Keycloak users"); }
  };
  useEffect(() => { void load(); }, [client, page]);

  async function perform(action: () => Promise<unknown>, success: string) {
    try { await action(); setMessage(success); setError(undefined); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "User management action failed"); }
  }
  function update(field: keyof UserDraft, value: string) { setDraft((current) => ({ ...current, [field]: value })); }
  async function loadSessions(user: KeycloakUserDto) {
    setSessionUser(user); setSessionsLoading(true); setError(undefined);
    try { setSessions(await keycloak.listSessions(user.id)); }
    catch (reason) { setSessions([]); setError(reason instanceof Error ? reason.message : "Unable to load platform sessions"); }
    finally { setSessionsLoading(false); }
  }

  return <section className="admin-page-stack">
    <SectionCard eyebrow="Identity" title="Keycloak users">
      <div className="ai-governance-action-panel compact">
        <label>Email<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label>Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label>Role<Select value={draft.role} onChange={(event) => update("role", event.target.value)}><option value="admin">Admin</option><option value="creator">Creator</option><option value="end_user">End user</option></Select></label>
        <label>Temporary password<input type="password" value={draft.temporaryPassword} onChange={(event) => update("temporaryPassword", event.target.value)} autoComplete="new-password" /></label>
        <button type="button" onClick={() => void perform(async () => { await keycloak.create(draft); setDraft(emptyDraft); }, "User created. Share the temporary password through an approved channel.")} disabled={!draft.email || !draft.name || !draft.temporaryPassword}>Create user</button>
      </div>
      {message ? <DecisionPanel tone="success" badge="complete" title={message} lines={["No password is displayed after submission."]} /> : null}
      {error ? <DecisionPanel tone="danger" badge="error" title={error} lines={["Try the action again or review Keycloak connectivity."]} /> : null}
    </SectionCard>
    <SectionCard eyebrow="Lifecycle" title="Directory users">
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><br /><span>{user.email}</span></td><td>{user.enabled ? "Enabled" : "Disabled"}</td>
        <td><Select className="w-40" aria-label={`Role for ${user.email}`} value={userRole(user)} onChange={(event) => void perform(() => keycloak.setRole(user.id, event.target.value as UserDraft["role"]), "Role updated.")}><option value="admin">Admin</option><option value="creator">Creator</option><option value="end_user">End user</option></Select></td>
        <td><button type="button" className="secondary-button" onClick={() => { const name = window.prompt("Name", user.name); const email = window.prompt("Email", user.email); if (name && email) void perform(() => keycloak.update(user.id, { name, email }), "User updated."); }}>Edit</button> {user.enabled ? <button type="button" className="secondary-button" onClick={() => void perform(() => keycloak.setEnabled(user.id, false), "User disabled.")}>Disable</button> : <button type="button" className="secondary-button" onClick={() => void perform(() => keycloak.setEnabled(user.id, true), "User enabled.")}>Enable</button>} <button type="button" className="secondary-button" onClick={() => { const temporaryPassword = window.prompt("Temporary password"); if (temporaryPassword) void perform(() => keycloak.resetPassword(user.id, temporaryPassword), "Password reset requested."); }}>Reset password</button> <button type="button" className="secondary-button" onClick={() => void loadSessions(user)}>View sessions</button> <button type="button" className="secondary-button danger-action" onClick={() => { if (window.confirm(`Revoke every active Horizon session for ${user.email}? They will need to sign in again.`)) void perform(async () => { await keycloak.revokeSessions(user.id); if (sessionUser?.id === user.id) await loadSessions(user); }, "All active Horizon sessions were revoked."); }}>Revoke sessions</button></td>
      </tr>)}</tbody></table></div>
      <div><button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button> <span>Page {page + 1}</span> <button type="button" className="secondary-button" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Next page</button></div>
    </SectionCard>
    {sessionUser ? <SectionCard eyebrow="Session security" title={`Platform sessions — ${sessionUser.email}`}><p>Only session metadata is shown. Refresh tokens and token hashes are never returned to the browser.</p>{sessionsLoading ? <p>Loading sessions…</p> : sessions.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}><td><code>{session.id}</code><br /><span>Family {session.sessionFamilyId}</span></td><td>{formatSessionDate(session.issuedAt)}</td><td>{formatSessionDate(session.expiresAt)}</td><td>{session.revokedAt ? `Revoked${session.revokeReason ? `: ${session.revokeReason}` : ""}` : "Active"}</td></tr>)}</tbody></table></div> : <DecisionPanel tone="warning" badge="empty" title="No Horizon sessions found" lines={["The user has not completed an OIDC login in this environment."]} />}</SectionCard> : null}
  </section>;
}

function formatSessionDate(value: string | undefined): string { return value ? new Date(value).toLocaleString() : "—"; }
