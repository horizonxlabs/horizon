import type { CreateKeycloakUserInput, KeycloakUserDto, KeycloakUserListMeta, KeycloakUserListPage, PlatformApiClient, PlatformSessionSummary } from "./index";

export function startKeycloakLogin(baseUrl: string, app: "admin" | "creator" | "store", returnTo: string): string {
  return `${baseUrl.replace(/\/$/, "")}/auth/keycloak/start?${new URLSearchParams({ app, returnTo })}`;
}

export function startKeycloakLogout(baseUrl: string, app: "admin" | "creator" | "store", returnTo: string): string {
  return `${baseUrl.replace(/\/$/, "")}/auth/keycloak/logout?${new URLSearchParams({ app, returnTo })}`;
}

export function createKeycloakUserClient(client: PlatformApiClient) {
  return {
    list: async ({ first = 0, max = 50 }: Partial<KeycloakUserListMeta> = {}): Promise<KeycloakUserListPage> => {
      const result = await client.requestWithMeta<KeycloakUserDto[]>(`/admin/keycloak/users?${new URLSearchParams({ first: String(first), max: String(max) })}`);
      return { users: result.data, meta: result.meta as KeycloakUserListMeta };
    },
    create: (input: CreateKeycloakUserInput) => client.request<KeycloakUserDto>("/admin/keycloak/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    update: (id: string, input: { email: string; name: string }) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    setEnabled: (id: string, enabled: boolean) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`, { method: "POST" }),
    setRole: (id: string, role: CreateKeycloakUserInput["role"]) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}/groups`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) }),
    resetPassword: (id: string, temporaryPassword: string) => client.request<void>(`/admin/keycloak/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ temporaryPassword }) }),
    listSessions: (id: string) => client.request<PlatformSessionSummary[]>(`/admin/keycloak/users/${encodeURIComponent(id)}/sessions`),
    revokeSessions: (id: string) => client.request<{ id: string; revoked: boolean }>(`/admin/keycloak/users/${encodeURIComponent(id)}/sessions/revoke`, { method: "POST" })
  };
}
