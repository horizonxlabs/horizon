import type { KeycloakUserDto } from "@evcp/api-client";
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useEffect, useState, type FormEvent } from "react";
import { roleOf, type UserRole } from "./lib/user-derivations";
import { UserSessionsPanel } from "./UserSessionsPanel";
import type { useKeycloakUsers } from "./use-keycloak-users";

type Props = {
  open: boolean;
  onClose: () => void;
  user?: KeycloakUserDto;
  users: ReturnType<typeof useKeycloakUsers>;
  onDone?: (msg: string) => void;
};

export function ManageUserDrawer({ open, onClose, user, users, onDone }: Props) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user ? roleOf(user) : "creator");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setRole(user ? roleOf(user) : "creator");
    setTemporaryPassword("");
    setError(undefined);
  }, [user]);

  if (!user) return null;

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await users.updateUser(user!.id, { name: name.trim(), email: email.trim() });
      onDone?.("User updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile could not be updated.");
    }
  }

  async function submitRole(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await users.changeRole(user!.id, role);
      onDone?.("Role updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role could not be updated.");
    }
  }

  async function toggleEnabled() {
    setError(undefined);
    try {
      await users.setEnabled(user!.id, !user!.enabled);
      onDone?.(user!.enabled ? "User disabled." : "User enabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status could not be changed.");
    }
  }

  async function submitResetPassword(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await users.resetPassword(user!.id, temporaryPassword);
      onDone?.("Password reset requested.");
      setTemporaryPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password could not be reset.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Manage user" description={user.email}>
      <div className="flex flex-col gap-6">
        {error && <p className="text-sm text-danger-strong">{error}</p>}

        <form className="flex flex-col gap-3" onSubmit={(e) => void submitProfile(e)}>
          <h3 className="text-sm font-semibold text-body">Profile</h3>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Save profile
            </Button>
          </div>
        </form>

        <form className="flex flex-col gap-3" onSubmit={(e) => void submitRole(e)}>
          <h3 className="text-sm font-semibold text-body">Role</h3>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="admin">Admin</option>
              <option value="creator">Creator</option>
              <option value="end_user">End user</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Save role
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-body">Status</h3>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted">Currently {user.enabled ? "enabled" : "disabled"}.</span>
            <Button type="button" variant={user.enabled ? "danger" : "secondary"} size="sm" onClick={() => void toggleEnabled()}>
              {user.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>

        <form className="flex flex-col gap-3" onSubmit={(e) => void submitResetPassword(e)}>
          <h3 className="text-sm font-semibold text-body">Reset password</h3>
          <Field label="Temporary password">
            <Input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Reset password
            </Button>
          </div>
        </form>

        <UserSessionsPanel user={user} users={users} />
      </div>
    </Drawer>
  );
}
