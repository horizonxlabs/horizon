import { createHash } from "node:crypto";

import type { PlatformRole } from "@evcp/types";
import type { CorePersistenceClient } from "./core-repositories";

/** Maintains the local projection used by persistence-backed routes from Keycloak's current claims. */
export async function upsertKeycloakUserProjection(
  client: CorePersistenceClient,
  input: { subject: string; email: string; name: string; role: PlatformRole }
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  const roles = {
    deleteMany: {} as Record<string, never>,
    create: [{ role: { connect: { key: input.role } } }]
  };
  const existing = await client.platformUser.findUnique({ where: { email } });
  if (existing) {
    await client.platformUser.update({ where: { id: existing.id }, data: { name, status: "active", roles } });
    return;
  }
  await client.platformUser.create({
    data: {
      id: keycloakPlatformUserId(input.subject),
      email,
      name,
      status: "active",
      roles: { create: roles.create }
    }
  });
}

/** Stable local user id for the Keycloak `sub`; shared by admin session-management actions. */
export function keycloakPlatformUserId(subject: string): string {
  return `usr_sso_${createHash("sha256").update(subject).digest("hex").slice(0, 12)}`;
}
