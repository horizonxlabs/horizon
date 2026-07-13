import type { PlatformRole } from "@evcp/types";
import type { AuditService, PlatformUser } from "../platform-services";
import type { KeycloakAdminClient } from "./admin-client";

export type KeycloakUserDto = { id: string; email: string; name: string; enabled: boolean; groups: string[]; createdAt?: string };
type KeycloakRecord = { id: string; email?: string; firstName?: string; enabled?: boolean; createdTimestamp?: number };
type KeycloakGroup = { id: string; name: string };
const ROLE_GROUP: Record<PlatformRole, string> = { admin: "evcp-admins", creator: "evcp-creators", end_user: "evcp-users" };
const EVCP_GROUPS = new Set(Object.values(ROLE_GROUP));

export class KeycloakUserService {
  constructor(private readonly deps: { client: KeycloakAdminClient; audit: AuditService; requireAdmin: (actor: PlatformUser) => void }) {}

  async list(actor: PlatformUser): Promise<KeycloakUserDto[]> {
    this.deps.requireAdmin(actor);
    const users = (await this.deps.client.get<KeycloakRecord[]>("/users")).data;
    return Promise.all(users.map((user) => this.toDto(user)));
  }

  async create(actor: PlatformUser, input: { email: string; name: string; role: PlatformRole; temporaryPassword: string }): Promise<KeycloakUserDto> {
    this.deps.requireAdmin(actor); this.requireRole(input.role);
    this.requireText(input.email, "email"); this.requireText(input.name, "name"); this.requireText(input.temporaryPassword, "temporary_password");
    const response = await this.deps.client.post<void>("/users", { email: input.email.trim().toLowerCase(), username: input.email.trim().toLowerCase(), firstName: input.name.trim(), enabled: true });
    const id = response.headers.get("location")?.split("/").at(-1);
    if (!id) throw new Error("invalid_keycloak_user_location");
    await this.deps.client.put(`/users/${encodeURIComponent(id)}/reset-password`, { type: "password", value: input.temporaryPassword, temporary: true });
    const user = await this.applyRole(actor, id, input.role);
    this.audit(actor, "auth.keycloak_user.created", id);
    return user;
  }

  async update(actor: PlatformUser, id: string, input: { email: string; name: string }): Promise<KeycloakUserDto> {
    this.deps.requireAdmin(actor);
    this.requireText(input.email, "email"); this.requireText(input.name, "name");
    const current = await this.record(id);
    await this.deps.client.put(`/users/${encodeURIComponent(id)}`, { ...current, email: input.email.trim().toLowerCase(), username: input.email.trim().toLowerCase(), firstName: input.name.trim() });
    const user = await this.toDto(await this.record(id)); this.audit(actor, "auth.keycloak_user.updated", id); return user;
  }

  async setEnabled(actor: PlatformUser, id: string, enabled: boolean): Promise<KeycloakUserDto> {
    this.deps.requireAdmin(actor);
    const current = await this.record(id);
    await this.deps.client.put(`/users/${encodeURIComponent(id)}`, { ...current, enabled });
    const user = await this.toDto(await this.record(id)); this.audit(actor, "auth.keycloak_user.enabled_changed", id, { enabled }); return user;
  }

  async setRole(actor: PlatformUser, id: string, role: PlatformRole): Promise<KeycloakUserDto> { return this.applyRole(actor, id, role, true); }

  async resetPassword(actor: PlatformUser, id: string, temporaryPassword: string): Promise<void> {
    this.deps.requireAdmin(actor);
    this.requireText(temporaryPassword, "temporary_password");
    await this.deps.client.put(`/users/${encodeURIComponent(id)}/reset-password`, { type: "password", value: temporaryPassword, temporary: true });
    this.audit(actor, "auth.keycloak_user.password_reset", id);
  }

  private async applyRole(actor: PlatformUser, id: string, role: PlatformRole, audit = true): Promise<KeycloakUserDto> {
    this.deps.requireAdmin(actor); this.requireRole(role);
    const current = await this.groups(id);
    for (const group of current.filter((group) => EVCP_GROUPS.has(group.name))) await this.deps.client.delete(`/users/${encodeURIComponent(id)}/groups/${encodeURIComponent(group.id)}`);
    const wanted = await this.groupByName(ROLE_GROUP[role]);
    await this.deps.client.put(`/users/${encodeURIComponent(id)}/groups/${encodeURIComponent(wanted.id)}`);
    const user = await this.toDto(await this.record(id));
    if (audit) this.audit(actor, "auth.keycloak_user.role_changed", id, { role });
    return user;
  }

  private async record(id: string): Promise<KeycloakRecord> { return (await this.deps.client.get<KeycloakRecord>(`/users/${encodeURIComponent(id)}`)).data; }
  private async groups(id: string): Promise<KeycloakGroup[]> { return (await this.deps.client.get<KeycloakGroup[]>(`/users/${encodeURIComponent(id)}/groups`)).data; }
  private async groupByName(name: string): Promise<KeycloakGroup> {
    const groups = (await this.deps.client.get<KeycloakGroup[]>(`/groups?search=${encodeURIComponent(name)}`)).data;
    const group = groups.find((candidate) => candidate.name === name); if (!group) throw new Error("keycloak_role_group_not_found"); return group;
  }
  private async toDto(record: KeycloakRecord): Promise<KeycloakUserDto> { return { id: record.id, email: record.email ?? "", name: record.firstName ?? record.email ?? "", enabled: record.enabled !== false, groups: (await this.groups(record.id)).map((group) => group.name), ...(record.createdTimestamp ? { createdAt: new Date(record.createdTimestamp).toISOString() } : {}) }; }
  private requireRole(role: string): asserts role is PlatformRole { if (!(role in ROLE_GROUP)) throw new Error("invalid_platform_role"); }
  private requireText(value: string, field: string): void { if (!value.trim()) throw new Error(`invalid_${field}`); }
  private audit(actor: PlatformUser, action: string, id: string, metadata: Record<string, unknown> = {}): void { this.deps.audit.record({ actorId: actor.id, action, resourceType: "keycloak_user", resourceId: id, metadata }); }
}
