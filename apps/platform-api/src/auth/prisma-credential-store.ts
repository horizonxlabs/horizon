import type { CredentialStore, CredentialRecord } from "./platform-credential-service";
import type { CorePersistenceClient } from "../persistence/core-repositories";

export function createCorePersistenceCredentialStore(
  client: CorePersistenceClient
): CredentialStore {
  return {
    async getByEmail(email: string): Promise<CredentialRecord | null> {
      const row = await client.platformUser.findUnique({
        where: { email: email.trim().toLowerCase() }
      });
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
    async setPassword(
      userId: string,
      fields: { passwordHash: string; mustChangePassword: boolean }
    ): Promise<void> {
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
 * Creates a platform user AND persists its role. Role is stored via a `platform_user_roles` join
 * (not a scalar column), so this helper emits the canonical Prisma nested-relation write
 * `roles: { create: [{ role: { connect: { key: role } } }] }`. This is the shape the REAL
 * `PrismaClient` (see `createPrismaCorePersistence`) requires — it creates the `platform_users`
 * row AND the `platform_user_roles` join row, connecting to the seeded `PlatformRole` by its
 * unique `key` ("creator" | "admin" | "end_user"). `MemoryCorePersistenceClient.platformUser.create`
 * accepts the same shape and translates it back into its internal join array via
 * `normalizeCreateRoles`, so both backends honor one call site.
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
      roles: { create: [{ role: { connect: { key: input.role } } }] }
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
