import type { MockUser, PlatformRole, Surface } from "@evcp/types";

export const surfaceAccess: Record<Surface, PlatformRole[]> = {
  admin: ["admin"],
  creator: ["creator", "admin"],
  store: ["end_user", "creator", "admin"]
};

export function canAccessSurface(user: MockUser, surface: Surface): boolean {
  return surfaceAccess[surface].includes(user.role);
}

export function getMockPermissions(role: PlatformRole): string[] {
  if (role === "admin") {
    return ["platform:admin", "ai:manage", "guardrail:manage", "audit:view"];
  }

  if (role === "creator") {
    return ["project:create", "project:update", "app:publish-request", "ticket:manage"];
  }

  return ["store:view", "ticket:create", "access:request"];
}

