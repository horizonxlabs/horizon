import { createKeycloakUserClient, type CreateKeycloakUserInput, type KeycloakUserDto, type PlatformApiClient } from "@evcp/api-client";
import { DecisionPanel, SectionCard } from "@evcp/ui";
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

  return <section className="admin-page-stack">
    <SectionCard eyebrow="Identity" title="Keycloak users">
      <div className="ai-governance-action-panel compact">
        <label>Email<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label>Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label>Role<select value={draft.role} onChange={(event) => update("role", event.target.value)}><option value="admin">Admin</option><option value="creator">Creator</option><option value="end_user">End user</option></select></label>
        <label>Temporary password<input type="password" value={draft.temporaryPassword} onChange={(event) => update("temporaryPassword", event.target.value)} autoComplete="new-password" /></label>
        <button type="button" onClick={() => void perform(async () => { await keycloak.create(draft); setDraft(emptyDraft); }, "User created. Share the temporary password through an approved channel.")} disabled={!draft.email || !draft.name || !draft.temporaryPassword}>Create user</button>
      </div>
      {message ? <DecisionPanel tone="success" badge="complete" title={message} lines={["No password is displayed after submission."]} /> : null}
      {error ? <DecisionPanel tone="danger" badge="error" title={error} lines={["Try the action again or review Keycloak connectivity."]} /> : null}
    </SectionCard>
    <SectionCard eyebrow="Lifecycle" title="Directory users">
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Status</th><th>Role</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><br /><span>{user.email}</span></td><td>{user.enabled ? "Enabled" : "Disabled"}</td>
        <td><select aria-label={`Role for ${user.email}`} value={userRole(user)} onChange={(event) => void perform(() => keycloak.setRole(user.id, event.target.value as UserDraft["role"]), "Role updated.")}><option value="admin">Admin</option><option value="creator">Creator</option><option value="end_user">End user</option></select></td>
        <td><button type="button" className="secondary-button" onClick={() => { const name = window.prompt("Name", user.name); const email = window.prompt("Email", user.email); if (name && email) void perform(() => keycloak.update(user.id, { name, email }), "User updated."); }}>Edit</button> {user.enabled ? <button type="button" className="secondary-button" onClick={() => void perform(() => keycloak.setEnabled(user.id, false), "User disabled.")}>Disable</button> : <button type="button" className="secondary-button" onClick={() => void perform(() => keycloak.setEnabled(user.id, true), "User enabled.")}>Enable</button>} <button type="button" className="secondary-button" onClick={() => { const temporaryPassword = window.prompt("Temporary password"); if (temporaryPassword) void perform(() => keycloak.resetPassword(user.id, temporaryPassword), "Password reset requested."); }}>Reset password</button></td>
      </tr>)}</tbody></table></div>
      <div><button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</button> <span>Page {page + 1}</span> <button type="button" className="secondary-button" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Next page</button></div>
    </SectionCard>
  </section>;
}
