import type {
  PersistedPlatformSession,
  PlatformSessionRepository
} from "../auth/platform-session-service";

type SessionRecord = Omit<PersistedPlatformSession, "email"> & {
  refreshTokenHash?: string | null;
  refreshExpiresAt?: Date | null;
  revokedAt?: Date | null;
  replacedBySessionId?: string | null;
};

type SessionDelegate = {
  create(input: { data: Omit<SessionRecord, "email"> }): Promise<SessionRecord>;
  findUnique(input: { where: { id?: string; refreshTokenHash?: string } }): Promise<SessionRecord | null>;
  update(input: { where: { id: string }; data: Record<string, unknown> }): Promise<SessionRecord>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findMany(input: { where: Record<string, unknown>; orderBy: { issuedAt: "desc" } }): Promise<SessionRecord[]>;
};

type SessionDatabase = {
  platformAuthSession: SessionDelegate;
  $transaction?: <T>(work: (database: SessionDatabase) => Promise<T>) => Promise<T>;
};

export function isPlatformSessionDatabase(value: unknown): value is SessionDatabase {
  return Boolean(value && typeof value === "object" && "platformAuthSession" in value);
}

/** Prisma-backed, process-independent Platform Auth session state. */
export class PrismaPlatformSessionRepository implements PlatformSessionRepository {
  constructor(private readonly database: SessionDatabase) {}

  async createSession(input: PersistedPlatformSession): Promise<void> {
    await this.database.platformAuthSession.create({ data: this.toRecord(input) });
  }

  async findById(id: string): Promise<PersistedPlatformSession | undefined> {
    return this.fromRecord(await this.database.platformAuthSession.findUnique({ where: { id } }));
  }

  async findByRefreshTokenHash(hash: string): Promise<PersistedPlatformSession | undefined> {
    return this.fromRecord(await this.database.platformAuthSession.findUnique({ where: { refreshTokenHash: hash } }));
  }

  async replaceSession(input: { previousId: string; next: PersistedPlatformSession }): Promise<boolean> {
    const replace = async (database: SessionDatabase) => {
      const updated = await database.platformAuthSession.updateMany({
        where: { id: input.previousId, revokedAt: null, replacedBySessionId: null },
        data: { replacedBySessionId: input.next.id, revokeReason: "refresh_rotated", lastUsedAt: new Date() }
      });
      if (!updated.count) return false;
      await database.platformAuthSession.create({ data: this.toRecord(input.next) });
      return true;
    };
    return this.database.$transaction ? this.database.$transaction(replace) : replace(this.database);
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await this.database.platformAuthSession.update({ where: { id }, data: { revokedAt: new Date(), revokeReason: reason } });
  }

  async revokeSessionFamily(familyId: string, reason: string): Promise<void> {
    await this.database.platformAuthSession.updateMany({ where: { sessionFamilyId: familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  }

  async revokeUserSessions(userId: string, reason: string): Promise<void> {
    await this.database.platformAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  }

  async listUserSessions(userId: string): Promise<PersistedPlatformSession[]> {
    return (await this.database.platformAuthSession.findMany({ where: { userId }, orderBy: { issuedAt: "desc" } })).flatMap((record) => {
      const session = this.fromRecord(record);
      return session ? [session] : [];
    });
  }

  private toRecord(input: PersistedPlatformSession): Omit<SessionRecord, "email"> {
    const { email: _email, ...record } = input;
    return record;
  }

  private fromRecord(record: SessionRecord | null): PersistedPlatformSession | undefined {
    if (!record) return undefined;
    const email = typeof record.claims.email === "string" ? record.claims.email : "";
    return { ...record, email };
  }
}

/** Explicit test/dev repository; production uses PrismaPlatformSessionRepository. */
export class MemoryPlatformSessionRepository implements PlatformSessionRepository {
  private readonly sessions = new Map<string, PersistedPlatformSession>();

  async createSession(input: PersistedPlatformSession): Promise<void> { this.sessions.set(input.id, structuredClone(input)); }
  async findById(id: string): Promise<PersistedPlatformSession | undefined> { return this.copy(this.sessions.get(id)); }
  async findByRefreshTokenHash(hash: string): Promise<PersistedPlatformSession | undefined> {
    return this.copy([...this.sessions.values()].find((session) => session.refreshTokenHash === hash));
  }
  async replaceSession(input: { previousId: string; next: PersistedPlatformSession }): Promise<boolean> {
    const previous = this.sessions.get(input.previousId);
    if (!previous || previous.revokedAt || previous.replacedBySessionId) return false;
    previous.replacedBySessionId = input.next.id;
    this.sessions.set(input.next.id, structuredClone(input.next));
    return true;
  }
  async revokeSession(id: string, _reason: string): Promise<void> { const session = this.sessions.get(id); if (session) { session.revokedAt = new Date(); } }
  async revokeSessionFamily(familyId: string, _reason: string): Promise<void> { this.revoke((session) => session.sessionFamilyId === familyId); }
  async revokeUserSessions(userId: string, _reason: string): Promise<void> { this.revoke((session) => session.userId === userId); }
  async listUserSessions(userId: string): Promise<PersistedPlatformSession[]> { return [...this.sessions.values()].filter((session) => session.userId === userId).map((session) => this.copy(session) as PersistedPlatformSession); }
  private revoke(matches: (session: PersistedPlatformSession) => boolean): void { for (const session of this.sessions.values()) if (matches(session) && !session.revokedAt) session.revokedAt = new Date(); }
  private copy(session: PersistedPlatformSession | undefined): PersistedPlatformSession | undefined { return session ? structuredClone(session) : undefined; }
}
