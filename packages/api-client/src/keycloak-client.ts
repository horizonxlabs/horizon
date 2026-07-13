import type { CreateKeycloakUserInput, KeycloakUserDto, PlatformApiClient } from "./index";

export function startKeycloakLogin(baseUrl: string, app: "admin" | "creator" | "store", returnTo: string): string {
  return `${baseUrl.replace(/\/$/, "")}/auth/keycloak/start?${new URLSearchParams({ app, returnTo })}`;
}

export function createKeycloakUserClient(client: PlatformApiClient) {
  return {
    list: () => client.request<KeycloakUserDto[]>("/admin/keycloak/users"),
    create: (input: CreateKeycloakUserInput) => client.request<KeycloakUserDto>("/admin/keycloak/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    update: (id: string, input: { email: string; name: string }) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    setEnabled: (id: string, enabled: boolean) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`, { method: "POST" }),
    setRole: (id: string, role: CreateKeycloakUserInput["role"]) => client.request<KeycloakUserDto>(`/admin/keycloak/users/${encodeURIComponent(id)}/groups`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) }),
    resetPassword: (id: string, temporaryPassword: string) => client.request<void>(`/admin/keycloak/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ temporaryPassword }) })
  };
}
