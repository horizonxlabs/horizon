import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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

export type OidcLoginResult = {
  session: PlatformAuthSession & { refreshToken?: string; refreshExpiresAt?: string };
  returnTo: string;
};

export type KeycloakOidcServiceDependencies = {
  config: KeycloakConfig;
  issueKeycloakSession: (claims: PlatformAuthClaims) =>
    | (PlatformAuthSession & { refreshToken?: string; refreshExpiresAt?: string })
    | Promise<PlatformAuthSession & { refreshToken?: string; refreshExpiresAt?: string }>;
  fetch?: typeof fetch;
  allowedReturnOrigins?: Partial<Record<PlatformApp, string>>;
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
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly random: (size: number) => Buffer;
  private readonly allowedReturnOrigins: Partial<Record<PlatformApp, string>>;

  constructor(private readonly deps: KeycloakOidcServiceDependencies) {
    this.fetcher = deps.fetch ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.random = deps.randomBytes ?? randomBytes;
    this.allowedReturnOrigins = deps.allowedReturnOrigins ?? {
      admin: "http://localhost:4100", creator: "http://localhost:4101", store: "http://localhost:4102"
    };
  }

  start(app: PlatformApp, returnTo: string): { state: string; authorizationUrl: string } {
    const safeReturnTo = this.requireAllowedReturnTo(app, returnTo);
    const nonce = this.token(32);
    const verifier = this.token(48);
    const state = this.encryptTransaction({
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

  logout(app: PlatformApp, returnTo: string): string {
    const safeReturnTo = this.requireAllowedReturnTo(app, returnTo);
    const params = new URLSearchParams({
      client_id: this.deps.config.platformClientId,
      post_logout_redirect_uri: safeReturnTo
    });
    return `${this.deps.config.issuerUrl}/protocol/openid-connect/logout?${params}`;
  }

  async complete(input: { code: string; state: string }): Promise<OidcLoginResult> {
    const transaction = this.consumeTransaction(input.state);
    if (!input.code?.trim()) throw new Error("invalid_oidc_code");
    const tokenResponse = await this.exchangeCode(input.code, transaction.verifier);
    const identity = await this.verifyIdToken(tokenResponse.id_token, transaction.nonce);
    const platformRoles = [...new Set(identity.groups.flatMap((group) => GROUP_ROLES[group as keyof typeof GROUP_ROLES] ?? []))];
    if (!platformRoles.length) throw new Error("unmapped_keycloak_group");
    const claims: PlatformAuthClaims = { ...identity, platformRoles, appRoles: {} };
    return { session: await this.deps.issueKeycloakSession(claims), returnTo: transaction.returnTo };
  }

  private consumeTransaction(state: string): OidcTransaction {
    try {
      const [version, nonceText, tagText, ciphertextText] = state.split(".");
      if (version !== "v1" || !nonceText || !tagText || !ciphertextText) throw new Error("invalid");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.stateEncryptionKey(),
        Buffer.from(nonceText, "base64url")
      );
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, "base64url")),
        decipher.final()
      ]);
      const transaction = JSON.parse(plaintext.toString("utf8")) as Partial<OidcTransaction>;
      if (
        (transaction.app !== "admin" && transaction.app !== "creator" && transaction.app !== "store") ||
        typeof transaction.returnTo !== "string" ||
        typeof transaction.nonce !== "string" ||
        !transaction.nonce ||
        typeof transaction.verifier !== "string" ||
        !transaction.verifier ||
        typeof transaction.expiresAt !== "number" ||
        transaction.expiresAt <= this.now().getTime()
      ) {
        throw new Error("invalid");
      }
      return {
        app: transaction.app,
        returnTo: this.requireAllowedReturnTo(transaction.app, transaction.returnTo),
        nonce: transaction.nonce,
        verifier: transaction.verifier,
        expiresAt: transaction.expiresAt
      };
    } catch {
      throw new Error("invalid_oidc_state");
    }
  }

  private encryptTransaction(transaction: OidcTransaction): string {
    const nonce = this.random(12);
    const cipher = createCipheriv("aes-256-gcm", this.stateEncryptionKey(), nonce);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(transaction), "utf8")),
      cipher.final()
    ]);
    return `v1.${nonce.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  private stateEncryptionKey(): Buffer {
    return createHash("sha256")
      .update(`evcp-keycloak-oidc-state:${this.deps.config.platformClientSecret}`)
      .digest();
  }

  private async exchangeCode(code: string, verifier: string): Promise<{ id_token: string }> {
    const response = await this.fetcher(`${this.deps.config.internalIssuerUrl}/protocol/openid-connect/token`, {
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
    const jwks = createRemoteJWKSet(new URL(`${this.deps.config.internalIssuerUrl}/protocol/openid-connect/certs`));
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

  private requireAllowedReturnTo(app: PlatformApp, returnTo: string): string {
    let parsed: URL;
    try { parsed = new URL(returnTo); } catch { throw new Error("invalid_return_to"); }
    if (parsed.origin !== this.allowedReturnOrigins[app]) throw new Error("invalid_return_to");
    return parsed.toString();
  }

  private token(size: number): string {
    return this.random(size).toString("base64url");
  }
}
