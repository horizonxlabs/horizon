import type { CredentialStore, CredentialRecord } from "./platform-credential-service";
import type { CorePersistenceClient } from "../persistence/core-repositories";

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
 * Creates a platform user. Role storage note (Task 4 investigation):
 * `MemoryCorePersistenceClient` / the mapped Prisma `PlatformUserRecord` store role via a
 * `roles` join (`PlatformUserRoleRecord[]`), not as a scalar column on the user row. There is
 * no scalar `role` field to set on `client.platformUser.create`, so this helper does NOT
 * attempt to persist a role — it only creates the base user record. Role assignment (the
 * join-table insert) is left to a later task. The requested `role` is still echoed back on
 * the returned object so callers have it available immediately after creation.
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
      status: "active"
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
