import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import { generateTempPassword } from "./creation";
import type { useKeycloakUsers } from "./use-keycloak-users";

type Role = "admin" | "creator" | "end_user";

type Props = {
  open: boolean;
  onClose: () => void;
  users: ReturnType<typeof useKeycloakUsers>;
  onDone?: (msg: string) => void;
};

export function AddUserDrawer({ open, onClose, users, onDone }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("creator");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string>();

  function reset() {
    setEmail("");
    setName("");
    setRole("creator");
    setTemporaryPassword("");
    setError(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await users.createUser({ email: email.trim(), name: name.trim(), role, temporaryPassword });
      onDone?.("User created. Share the temporary password through an approved channel.");
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be created.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add user" description="Provision a new Horizon identity.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="creator">Creator</option>
            <option value="end_user">End user</option>
          </Select>
        </Field>
        <Field label="Temporary password">
          <div className="flex gap-2">
            <Input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => setTemporaryPassword(generateTempPassword())}>
              Generate
            </Button>
          </div>
        </Field>
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create user</Button>
        </div>
      </form>
    </Drawer>
  );
}
