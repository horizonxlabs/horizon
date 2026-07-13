import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type PlatformSessionSubject = {
  id: string;
  email: string;
  providerConfigId: string;
  claims: Record<string, unknown>;
};

export type PlatformTokenPair = {
  token: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  sessionId: string;
};

export type PersistedPlatformSession = {
  id: string;
  sessionFamilyId: string;
  accessTokenId: string;
  userId: string;
  email: string;
  providerConfigId: string;
  claims: Record<string, unknown>;
  sessionTokenHash: string;
  refreshTokenHash?: string | null;
  expiresAt: Date;
  refreshExpiresAt?: Date | null;
  revokedAt?: Date | null;
  replacedBySessionId?: string | null;
};

export interface PlatformSessionRepository {
  createSession(input: PersistedPlatformSession): Promise<void>;
  findById(id: string): Promise<PersistedPlatformSession | undefined>;
  findByRefreshTokenHash(hash: string): Promise<PersistedPlatformSession | undefined>;
  replaceSession(input: { previousId: string; next: PersistedPlatformSession }): Promise<boolean>;
  revokeSession(id: string, reason: string): Promise<void>;
  revokeSessionFamily(familyId: string, reason: string): Promise<void>;
  revokeUserSessions(userId: string, reason: string): Promise<void>;
}

type AccessPayload = { typ: "evcp.platform.session"; sid: string; jti: string; sub: string; email: string; iat: number; exp: number };

export class PlatformSessionError extends Error {
  constructor(readonly code: "invalid_session" | "expired_session" | "revoked_session" | "invalid_refresh_token" | "refresh_token_reused") {
    super(code);
  }
}

export class PlatformSessionService {
  constructor(
    private readonly repository: PlatformSessionRepository,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async issue(subject: PlatformSessionSubject): Promise<PlatformTokenPair> {
    const now = this.now();
    const session = this.newSession(subject, now, this.id());
    await this.repository.createSession(session.record);
    return session.pair;
  }

  async verify(token: string): Promise<PersistedPlatformSession> {
    const payload = this.decodeAccessToken(token);
    if (this.now().getTime() >= payload.exp * 1000) throw new PlatformSessionError("expired_session");
    const session = await this.repository.findById(payload.sid);
    if (!session || session.userId !== payload.sub || session.email !== payload.email || session.accessTokenId !== payload.jti) {
      throw new PlatformSessionError("invalid_session");
    }
    if (session.revokedAt || session.replacedBySessionId) throw new PlatformSessionError("revoked_session");
    if (this.now().getTime() >= session.expiresAt.getTime()) throw new PlatformSessionError("expired_session");
    return session;
  }

  async refresh(refreshToken: string): Promise<PlatformTokenPair> {
    const existing = await this.repository.findByRefreshTokenHash(this.hash(refreshToken));
    if (!existing || !existing.refreshExpiresAt) throw new PlatformSessionError("invalid_refresh_token");
    if (existing.replacedBySessionId) {
      await this.repository.revokeSessionFamily(existing.sessionFamilyId, "refresh_token_reused");
      throw new PlatformSessionError("refresh_token_reused");
    }
    if (existing.revokedAt) throw new PlatformSessionError("invalid_refresh_token");
    if (this.now().getTime() >= existing.refreshExpiresAt.getTime()) throw new PlatformSessionError("invalid_refresh_token");
    const next = this.newSession({
      id: existing.userId,
      email: existing.email,
      providerConfigId: existing.providerConfigId,
      claims: existing.claims
    }, this.now(), existing.sessionFamilyId);
    if (!await this.repository.replaceSession({ previousId: existing.id, next: next.record })) {
      await this.repository.revokeSessionFamily(existing.sessionFamilyId, "refresh_token_reused");
      throw new PlatformSessionError("refresh_token_reused");
    }
    return next.pair;
  }

  logout(sessionId: string): Promise<void> {
    return this.repository.revokeSession(sessionId, "logout");
  }

  revokeUserSessions(userId: string, reason: string): Promise<void> {
    return this.repository.revokeUserSessions(userId, reason);
  }

  private newSession(subject: PlatformSessionSubject, issuedAt: Date, sessionFamilyId: string): { record: PersistedPlatformSession; pair: PlatformTokenPair } {
    const id = this.id();
    const accessTokenId = this.id();
    const expiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    const refreshExpiresAt = new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    const refreshToken = this.token();
    const payload: AccessPayload = { typ: "evcp.platform.session", sid: id, jti: accessTokenId, sub: subject.id, email: subject.email, iat: Math.floor(issuedAt.getTime() / 1000), exp: Math.floor(expiresAt.getTime() / 1000) };
    const token = this.encodeAccessToken(payload);
    return {
      record: {
        id, sessionFamilyId, accessTokenId, userId: subject.id, email: subject.email,
        providerConfigId: subject.providerConfigId, claims: subject.claims,
        sessionTokenHash: this.hash(token), refreshTokenHash: this.hash(refreshToken), expiresAt, refreshExpiresAt
      },
      pair: { token, expiresAt: expiresAt.toISOString(), refreshToken, refreshExpiresAt: refreshExpiresAt.toISOString(), sessionId: id }
    };
  }

  private encodeAccessToken(payload: AccessPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `evcp_session.${encoded}.${this.sign(encoded)}`;
  }

  private decodeAccessToken(token: string): AccessPayload {
    const [prefix, encoded, signature, ...extra] = token.split(".");
    if (prefix !== "evcp_session" || !encoded || !signature || extra.length || !this.same(signature, this.sign(encoded))) throw new PlatformSessionError("invalid_session");
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<AccessPayload>;
      if (payload.typ !== "evcp.platform.session" || !payload.sid || !payload.jti || !payload.sub || !payload.email || !payload.exp) throw new Error("invalid");
      return payload as AccessPayload;
    } catch {
      throw new PlatformSessionError("invalid_session");
    }
  }

  private sign(value: string): string { return createHmac("sha256", this.secret).update(value).digest("base64url"); }
  private hash(value: string): string { return createHash("sha256").update(value).digest("base64url"); }
  private token(): string { return randomBytes(48).toString("base64url"); }
  private id(): string { return randomBytes(18).toString("base64url"); }
  private same(a: string, b: string): boolean { return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
}
