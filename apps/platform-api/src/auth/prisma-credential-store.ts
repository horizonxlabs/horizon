import type { CredentialStore, CredentialRecord } from "./platform-credential-service";
import { buildPlatformUserRoleRecords, type CorePersistenceClient } from "../persistence/core-repositories";

export function createCorePersistenceCredentialStore(client: CorePersistenceClient): CredentialStore {
  return {
    async getByEmail(email: string): Promise<CredentialRecord | null> {
      const row = await client.platformUser.findUnique({ where: { email: email.trim().toLowerCase() } });
      return row
        ? {
            userId: row.id,
            passwordHash: row.passwordHash ?? null,
            mustChangePassword: row.mustChangePassword ?? false
          }
        : null;
    },
    async getById(userId: string): Promise<CredentialRecord | null> {
      const row = await client.platformUser.findUnique({ where: { id: userId } });
      return row
        ? {
            userId: row.id,
            passwordHash: row.passwordHash ?? null,
            mustChangePassword: row.mustChangePassword ?? false
          }
        : null;
    },
    async setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void> {
      await client.platformUser.update({
        where: { id: userId },
        data: {
          passwordHash: fields.passwordHash,
          mustChangePassword: fields.mustChangePassword,
          passwordUpdatedAt: new Date()
        }
      });
    }
  };
}

export interface CreateUserWithRoleInput {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface CreatedUserWithRole {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Creates a platform user AND persists its role. Role storage note (Task 4/5 investigation):
 * `MemoryCorePersistenceClient` / the mapped Prisma `PlatformUserRecord` store role via a
 * `roles` join (`PlatformUserRoleRecord[]`), not as a scalar column on the user row. There is
 * no scalar `role` field on `client.platformUser.create`'s row itself, so this helper builds
 * the role-join record (`buildPlatformUserRoleRecords`, mirroring the seed pattern used for
 * default users) and passes it as `data.roles`. The memory persistence client (Task 5) now
 * stores this directly on the created record. The real Prisma path (`createPrismaCorePersistence`)
 * casts a `PrismaClient` to `CorePersistenceClient`; a real Prisma schema would need a nested
 * `roles: { create: { role: { connect: { key: role } } } }` write to honor this same `data.roles`
 * shape via a translation layer — this is left for live verification (Task 9) since the
 * integration tests in this task run in memory mode only.
 */
export async function createUserWithRole(
  client: CorePersistenceClient,
  input: CreateUserWithRoleInput
): Promise<CreatedUserWithRole> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const created = await client.platformUser.create({
    data: {
      id: input.id,
      email,
      name,
      status: "active",
      roles: buildPlatformUserRoleRecords(input.role)
    }
  });

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    role: input.role,
    status: created.status
  };
}
