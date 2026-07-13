import type { KeycloakConfig } from "./config";

export type KeycloakAdminClientDependencies = {
  config: KeycloakConfig;
  fetch?: typeof fetch;
};

export type KeycloakAdminResponse<T> = { status: number; data: T; headers: Headers };

/** Server-only Keycloak Admin API client. Its service credentials never cross this boundary. */
export class KeycloakAdminClient {
  private readonly fetcher: typeof fetch;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly deps: KeycloakAdminClientDependencies) {
    this.fetcher = deps.fetch ?? fetch;
  }

  get<T>(path: string): Promise<KeycloakAdminResponse<T>> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<KeycloakAdminResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<KeycloakAdminResponse<T>> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<KeycloakAdminResponse<T>> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<KeycloakAdminResponse<T>> {
    const response = await this.fetcher(`${this.adminBaseUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.serviceToken()}`,
        ...(body === undefined ? {} : { "content-type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error(`keycloak_admin_${method.toLowerCase()}_failed`);
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text) : undefined) as T, headers: response.headers };
  }

  private async serviceToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 10_000) return this.token.value;
    const response = await this.fetcher(`${this.deps.config.issuerUrl}/protocol/openid-connect/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.deps.config.adminClientId}:${this.deps.config.adminClientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    if (!response.ok) throw new Error("keycloak_admin_token_failed");
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) throw new Error("invalid_keycloak_admin_token");
    this.token = { value: body.access_token, expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 60) * 1000 };
    return this.token.value;
  }

  private adminBaseUrl(): string {
    const issuer = new URL(this.deps.config.issuerUrl);
    return `${issuer.origin}/admin/realms/${encodeURIComponent(this.deps.config.realm)}`;
  }
}
