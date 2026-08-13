import { getMockPermissions } from "@evcp/auth-sdk";
import { mockUsers } from "@evcp/mock-data";
import type { MockUser, PlatformRole } from "@evcp/types";
import { createHash } from "node:crypto";

import type { PlatformUser } from "./platform-services";
import { MockAuthError } from "./platform-errors";

function toPlatformUser(user: MockUser): PlatformUser {
  return {
    ...user,
    status: "active",
    permissions: getMockPermissions(user.role)
  };
}

export class IdentityService {
  private readonly users = Object.values(mockUsers).map(toPlatformUser);

  listUsers(): PlatformUser[] {
    return [...this.users];
  }

  getUserByEmail(email: string): PlatformUser {
    const user = this.users.find((candidate) => candidate.email === email);
    if (!user) throw new MockAuthError(`Unknown mock user: ${email}`);
    return user;
  }

  provisionSsoUser(input: {
    email: string;
    name: string;
    platformRoles: PlatformRole[];
  }): PlatformUser {
    const email = input.email.trim().toLowerCase();
    const existing = this.users.find((candidate) => candidate.email === email);
    if (existing)
      return Object.assign(existing, {
        name: input.name.trim() || email,
        role: this.primaryPlatformRole(input.platformRoles),
        permissions: getMockPermissions(this.primaryPlatformRole(input.platformRoles))
      });

    const role = this.primaryPlatformRole(input.platformRoles);
    const user: PlatformUser = {
      id: `usr_sso_${createHash("sha256").update(email).digest("hex").slice(0, 12)}`,
      name: input.name.trim() || email,
      email,
      role,
      status: "active",
      permissions: getMockPermissions(role)
    };
    this.users.push(user);
    return user;
  }

  private primaryPlatformRole(roles: PlatformRole[]): PlatformRole {
    if (roles.includes("admin")) return "admin";
    if (roles.includes("creator")) return "creator";
    return "end_user";
  }

  /**
   * Registers (or updates) a `PlatformUser` with a caller-specified id, upserting by email.
   * Used to dual-write users created through core-persistence (e.g. the native `/admin/users`
   * route) into this separate mock-identity store, so bearer session tokens issued for them
   * later resolve correctly via `MockAuthService.resolve()`/`resolveCurrentUser()` (both of
   * which look the user up here by email, not in core-persistence).
   */
  registerUser(user: PlatformUser): PlatformUser {
    const email = user.email.trim().toLowerCase();
    const existingIndex = this.users.findIndex((candidate) => candidate.email === email);
    const normalized: PlatformUser = { ...user, email };
    if (existingIndex >= 0) {
      this.users[existingIndex] = normalized;
    } else {
      this.users.push(normalized);
    }
    return normalized;
  }
}
