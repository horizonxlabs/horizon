import { hashPassword, verifyPassword, isStrongEnough } from "./password-hash";

export interface CredentialRecord {
  userId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
}

export interface CredentialStore {
  getByEmail(email: string): Promise<CredentialRecord | null>;
  getById(userId: string): Promise<CredentialRecord | null>;
  setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void>;
}

export interface PlatformCredentialService {
  setPassword(
    userId: string,
    plaintext: string,
    opts: { mustChange: boolean }
  ): Promise<{ ok: true } | { ok: false; reason: "weak_password" }>;
  verifyLogin(email: string, plaintext: string): Promise<{ userId: string; mustChangePassword: boolean } | null>;
  changePassword(
    userId: string,
    currentPlaintext: string,
    newPlaintext: string
  ): Promise<{ ok: true } | { ok: false; reason: "wrong_current" | "weak_password" }>;
}

export function createPlatformCredentialService(store: CredentialStore): PlatformCredentialService {
  return {
    async setPassword(userId, plaintext, opts) {
      if (!isStrongEnough(plaintext)) return { ok: false, reason: "weak_password" };
      const passwordHash = await hashPassword(plaintext);
      await store.setPassword(userId, { passwordHash, mustChangePassword: opts.mustChange });
      return { ok: true };
    },

    async verifyLogin(email, plaintext) {
      const record = await store.getByEmail(email.trim().toLowerCase());
      if (!record || !record.passwordHash) return null;
      const valid = await verifyPassword(plaintext, record.passwordHash);
      if (!valid) return null;
      return { userId: record.userId, mustChangePassword: record.mustChangePassword };
    },

    async changePassword(userId, currentPlaintext, newPlaintext) {
      const record = await store.getById(userId);
      if (!record || !record.passwordHash) return { ok: false, reason: "wrong_current" };
      if (!(await verifyPassword(currentPlaintext, record.passwordHash))) {
        return { ok: false, reason: "wrong_current" };
      }
      if (!isStrongEnough(newPlaintext)) return { ok: false, reason: "weak_password" };
      const passwordHash = await hashPassword(newPlaintext);
      await store.setPassword(userId, { passwordHash, mustChangePassword: false });
      return { ok: true };
    }
  };
}

export class MemoryCredentialStore implements CredentialStore {
  private readonly rows: Array<{
    userId: string;
    email: string;
    passwordHash: string | null;
    mustChangePassword: boolean;
  }>;

  constructor(
    seed: Array<{ userId: string; email: string; passwordHash?: string | null; mustChangePassword?: boolean }> = []
  ) {
    this.rows = seed.map((row) => ({
      userId: row.userId,
      email: row.email.trim().toLowerCase(),
      passwordHash: row.passwordHash ?? null,
      mustChangePassword: row.mustChangePassword ?? false
    }));
  }

  async getByEmail(email: string): Promise<CredentialRecord | null> {
    const row = this.rows.find((candidate) => candidate.email === email.trim().toLowerCase());
    return row ? { userId: row.userId, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
  }

  async getById(userId: string): Promise<CredentialRecord | null> {
    const row = this.rows.find((candidate) => candidate.userId === userId);
    return row ? { userId: row.userId, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
  }

  async setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.userId === userId);
    if (!row) throw new Error(`MemoryCredentialStore: unknown userId ${userId}`);
    row.passwordHash = fields.passwordHash;
    row.mustChangePassword = fields.mustChangePassword;
  }
}
