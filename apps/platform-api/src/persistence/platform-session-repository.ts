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
};

type SessionDatabase = { platformAuthSession: SessionDelegate };

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

  async replaceSession(input: { previousId: string; next: PersistedPlatformSession }): Promise<void> {
    await this.database.platformAuthSession.update({
      where: { id: input.previousId },
      data: { replacedBySessionId: input.next.id, revokeReason: "refresh_rotated" }
    });
    await this.createSession(input.next);
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
