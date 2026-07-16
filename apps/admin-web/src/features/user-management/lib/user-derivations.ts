import type { KeycloakUserDto } from "@evcp/api-client";

export type UserRole = "admin" | "creator" | "end_user";

export function roleOf(user: KeycloakUserDto): UserRole {
  if (user.groups.includes("evcp-admins")) return "admin";
  if (user.groups.includes("evcp-users")) return "end_user";
  return "creator";
}

export type RoleCounts = { total: number; admin: number; creator: number; end_user: number };

export function roleCounts(users: KeycloakUserDto[]): RoleCounts {
  return users.reduce<RoleCounts>(
    (counts, user) => {
      counts.total += 1;
      counts[roleOf(user)] += 1;
      return counts;
    },
    { total: 0, admin: 0, creator: 0, end_user: 0 }
  );
}
