import type { KeycloakUserDto, PlatformSessionSummary } from "@evcp/api-client";
import { Button, Table, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import type { useKeycloakUsers } from "./use-keycloak-users";

type Props = {
  user: KeycloakUserDto;
  users: ReturnType<typeof useKeycloakUsers>;
};

function formatSessionDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function UserSessionsPanel({ user, users }: Props) {
  const [sessions, setSessions] = useState<PlatformSessionSummary[]>();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function loadSessions() {
    setLoading(true);
    try {
      setSessions(await users.listSessions(user.id));
    } finally {
      setLoading(false);
    }
  }

  async function confirmRevoke() {
    await users.revokeSessions(user.id);
    setConfirming(false);
    await loadSessions();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-body">Platform sessions</h3>
        <Button type="button" variant="secondary" size="sm" onClick={() => void loadSessions()}>
          {loading ? "Loading…" : "View sessions"}
        </Button>
      </div>

      {sessions && sessions.length > 0 && (
        <Table>
          <THead>
            <TRow>
              <TCell>Session</TCell>
              <TCell>Issued</TCell>
              <TCell>Expires</TCell>
              <TCell>Status</TCell>
            </TRow>
          </THead>
          <tbody>
            {sessions.map((session) => (
              <TRow key={session.id}>
                <TCell>
                  <code>{session.id}</code>
                </TCell>
                <TCell>{formatSessionDate(session.issuedAt)}</TCell>
                <TCell>{formatSessionDate(session.expiresAt)}</TCell>
                <TCell>{session.revokedAt ? `Revoked${session.revokeReason ? `: ${session.revokeReason}` : ""}` : "Active"}</TCell>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}
      {sessions && sessions.length === 0 && <p className="text-sm text-muted">No Horizon sessions found.</p>}

      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm text-body">Revoke all sessions for {user.email}?</span>
            <Button type="button" variant="danger" size="sm" onClick={() => void confirmRevoke()}>
              Confirm revoke
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Revoke all sessions
          </Button>
        )}
      </div>
    </section>
  );
}
