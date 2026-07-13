import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { KeycloakConfig } from "./config";
import type { PlatformAuthClaims, PlatformAuthSession } from "../platform-services";

type PlatformApp = "admin" | "creator" | "store";

type OidcTransaction = {
  app: PlatformApp;
  returnTo: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
};

type VerifiedIdentity = Pick<PlatformAuthClaims, "subject" | "email" | "name" | "groups">;

export type OidcLoginResult = { session: PlatformAuthSession; returnTo: string };

export type KeycloakOidcServiceDependencies = {
  config: KeycloakConfig;
  issueKeycloakSession: (claims: PlatformAuthClaims) => PlatformAuthSession;
  fetch?: typeof fetch;
  allowedReturnOrigins?: string[];
  now?: () => Date;
  randomBytes?: (size: number) => Buffer;
  verifyIdToken?: (input: { idToken: string; nonce: string }) => Promise<VerifiedIdentity>;
};

const GROUP_ROLES = {
  "evcp-admins": "admin",
  "evcp-creators": "creator",
  "evcp-users": "end_user"
} as const;

/** Server-side authorization-code broker. Keycloak tokens never leave this service. */
export class KeycloakOidcService {
  private readonly transactions = new Map<string, OidcTransaction>();
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly random: (size: number) => Buffer;
  private readonly allowedReturnOrigins: Set<string>;

  constructor(private readonly deps: KeycloakOidcServiceDependencies) {
    this.fetcher = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.random = deps.randomBytes ?? randomBytes;
    this.allowedReturnOrigins = new Set(
      deps.allowedReturnOrigins ?? ["http://localhost:4100", "http://localhost:4101", "http://localhost:4102"]
    );
  }

  start(app: PlatformApp, returnTo: string): { state: string; authorizationUrl: string } {
    const safeReturnTo = this.requireAllowedReturnTo(returnTo);
    const state = this.token(32);
    const nonce = this.token(32);
    const verifier = this.token(48);
    this.transactions.set(state, {
      app,
      returnTo: safeReturnTo,
      nonce,
      verifier,
      expiresAt: this.now().getTime() + 5 * 60 * 1000
    });
    const params = new URLSearchParams({
      client_id: this.deps.config.platformClientId,
      redirect_uri: this.deps.config.callbackUrl,
      response_type: "code",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256"
    });
    return {
      state,
      authorizationUrl: `${this.deps.config.issuerUrl}/protocol/openid-connect/auth?${params}`
    };
  }

  async complete(input: { code: string; state: string }): Promise<OidcLoginResult> {
    const transaction = this.consumeTransaction(input.state);
    if (!input.code?.trim()) throw new Error("invalid_oidc_code");
    const tokenResponse = await this.exchangeCode(input.code, transaction.verifier);
    const identity = await this.verifyIdToken(tokenResponse.id_token, transaction.nonce);
    const platformRoles = [...new Set(identity.groups.flatMap((group) => GROUP_ROLES[group as keyof typeof GROUP_ROLES] ?? []))];
    if (!platformRoles.length) throw new Error("unmapped_keycloak_group");
    const claims: PlatformAuthClaims = { ...identity, platformRoles, appRoles: {} };
    return { session: this.deps.issueKeycloakSession(claims), returnTo: transaction.returnTo };
  }

  private consumeTransaction(state: string): OidcTransaction {
    const transaction = this.transactions.get(state);
    this.transactions.delete(state);
    if (!transaction || transaction.expiresAt <= this.now().getTime()) throw new Error("invalid_oidc_state");
    return transaction;
  }

  private async exchangeCode(code: string, verifier: string): Promise<{ id_token: string }> {
    const response = await this.fetcher(`${this.deps.config.issuerUrl}/protocol/openid-connect/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.deps.config.platformClientId}:${this.deps.config.platformClientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code.trim(),
        redirect_uri: this.deps.config.callbackUrl,
        code_verifier: verifier
      })
    });
    if (!response.ok) throw new Error("keycloak_code_exchange_failed");
    const body = (await response.json()) as { id_token?: unknown };
    if (typeof body.id_token !== "string" || !body.id_token) throw new Error("invalid_keycloak_token_response");
    return { id_token: body.id_token };
  }

  private async verifyIdToken(idToken: string, nonce: string): Promise<VerifiedIdentity> {
    if (this.deps.verifyIdToken) return this.deps.verifyIdToken({ idToken, nonce });
    const jwks = createRemoteJWKSet(new URL(`${this.deps.config.issuerUrl}/protocol/openid-connect/certs`));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: this.deps.config.issuerUrl,
      audience: this.deps.config.platformClientId
    });
    if (payload.nonce !== nonce) throw new Error("invalid_oidc_nonce");
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") throw new Error("invalid_keycloak_claims");
    return {
      subject: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      groups: Array.isArray(payload.groups) ? payload.groups.filter((group): group is string => typeof group === "string") : []
    };
  }

  private requireAllowedReturnTo(returnTo: string): string {
    let parsed: URL;
    try { parsed = new URL(returnTo); } catch { throw new Error("invalid_return_to"); }
    if (!this.allowedReturnOrigins.has(parsed.origin)) throw new Error("invalid_return_to");
    return parsed.toString();
  }

  private token(size: number): string {
    return this.random(size).toString("base64url");
  }
}
