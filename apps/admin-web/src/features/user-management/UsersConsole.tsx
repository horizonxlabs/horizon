import type { KeycloakUserDto, PlatformApiClient } from "@evcp/api-client";
import { Badge, Button, DecisionPanel, MetricCard, PageHeader, SectionCard, Table, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import { AddUserDrawer } from "./AddUserDrawer";
import { ManageUserDrawer } from "./ManageUserDrawer";
import { roleCounts, roleOf } from "./lib/user-derivations";
import { useKeycloakUsers } from "./use-keycloak-users";

const roleLabel: Record<ReturnType<typeof roleOf>, string> = {
  admin: "Admin",
  creator: "Creator",
  end_user: "End user"
};

export function UsersConsole({ client }: { client: PlatformApiClient }) {
  const users = useKeycloakUsers(client);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selected, setSelected] = useState<KeycloakUserDto>();
  const pageSize = 10;

  const counts = roleCounts(users.users);

  function manage(user: KeycloakUserDto) {
    setSelected(user);
    setManageOpen(true);
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Identity"
        title="Users"
        description="Provision and govern Keycloak identities."
        actions={<Button onClick={() => setAddOpen(true)}>+ Add user</Button>}
      />

      {users.error ? (
        <DecisionPanel
          tone="danger"
          badge="error"
          title={users.error}
          lines={["Try the action again or review Keycloak connectivity."]}
        />
      ) : null}

      <section className="ds-metric-grid">
        <MetricCard label="Total" value={String(counts.total)} detail="Keycloak identities on this page" tone="neutral" />
        <MetricCard label="Admins" value={String(counts.admin)} detail="evcp-admins group" tone="info" />
        <MetricCard label="Creators" value={String(counts.creator)} detail="default builder role" tone="success" />
        <MetricCard label="End users" value={String(counts.end_user)} detail="evcp-users group" tone="neutral" />
      </section>

      <SectionCard eyebrow="Directory" title="Users">
        <Table>
          <THead>
            <TRow>
              <TCell>User</TCell>
              <TCell>Status</TCell>
              <TCell>Role</TCell>
              <TCell>Actions</TCell>
            </TRow>
          </THead>
          <tbody>
            {users.users.map((user) => (
              <TRow key={user.id}>
                <TCell>
                  <div className="flex flex-col">
                    <strong className="text-body">{user.name}</strong>
                    <span className="text-sm text-muted">{user.email}</span>
                  </div>
                </TCell>
                <TCell>
                  <Badge tone={user.enabled ? "success" : "danger"}>{user.enabled ? "Enabled" : "Disabled"}</Badge>
                </TCell>
                <TCell>
                  <Badge tone="info">{roleLabel[roleOf(user)]}</Badge>
                </TCell>
                <TCell>
                  <Button variant="secondary" size="sm" onClick={() => manage(user)}>
                    Manage
                  </Button>
                </TCell>
              </TRow>
            ))}
          </tbody>
        </Table>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={users.page === 0}
            onClick={() => users.setPage(users.page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted">Page {users.page + 1}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={(users.page + 1) * pageSize >= users.meta.total}
            onClick={() => users.setPage(users.page + 1)}
          >
            Next
          </Button>
        </div>
      </SectionCard>

      <AddUserDrawer open={addOpen} onClose={() => setAddOpen(false)} users={users} onDone={() => setAddOpen(false)} />
      <ManageUserDrawer
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        user={selected}
        users={users}
        onDone={() => {}}
      />
    </section>
  );
}
