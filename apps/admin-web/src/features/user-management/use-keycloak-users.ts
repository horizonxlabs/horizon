import {
  createKeycloakUserClient,
  type CreateKeycloakUserInput,
  type KeycloakUserDto,
  type KeycloakUserListMeta,
  type PlatformApiClient,
  type PlatformSessionSummary
} from "@evcp/api-client";
import { useEffect, useState } from "react";

const emptyMeta: KeycloakUserListMeta = { first: 0, max: 0, total: 0 };
const pageSize = 10;

export function useKeycloakUsers(client: PlatformApiClient) {
  const keycloak = createKeycloakUserClient(client);
  const [users, setUsers] = useState<KeycloakUserDto[]>([]);
  const [meta, setMeta] = useState<KeycloakUserListMeta>(emptyMeta);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const reload = async () => {
    try {
      const result = await keycloak.list({ first: page * pageSize, max: pageSize });
      setUsers(result.users);
      setMeta(result.meta);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Keycloak users");
    }
  };
  useEffect(() => {
    void reload();
  }, [client, page]);

  async function perform(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setMessage(success);
      setError(undefined);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "User management action failed");
    }
  }

  async function createUser(input: CreateKeycloakUserInput) {
    await perform(
      () => keycloak.create(input),
      "User created. Share the temporary password through an approved channel."
    );
  }
  async function updateUser(id: string, input: { email: string; name: string }) {
    await perform(() => keycloak.update(id, input), "User updated.");
  }
  async function changeRole(id: string, role: CreateKeycloakUserInput["role"]) {
    await perform(() => keycloak.setRole(id, role), "Role updated.");
  }
  async function setEnabled(id: string, enabled: boolean) {
    await perform(() => keycloak.setEnabled(id, enabled), enabled ? "User enabled." : "User disabled.");
  }
  async function resetPassword(id: string, temporaryPassword: string) {
    await perform(() => keycloak.resetPassword(id, temporaryPassword), "Password reset requested.");
  }
  async function listSessions(id: string): Promise<PlatformSessionSummary[]> {
    try {
      const sessions = await keycloak.listSessions(id);
      setError(undefined);
      return sessions;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load platform sessions");
      return [];
    }
  }
  async function revokeSessions(id: string) {
    await perform(() => keycloak.revokeSessions(id), "All active Horizon sessions were revoked.");
  }

  return {
    users,
    meta,
    page,
    setPage,
    message,
    error,
    reload,
    createUser,
    updateUser,
    changeRole,
    setEnabled,
    resetPassword,
    listSessions,
    revokeSessions
  };
}
