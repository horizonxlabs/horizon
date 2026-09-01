import type { PlatformRequest } from "./app-factory";

/**
 * Pure path-matching predicates used by app-factory's async request dispatcher to decide whether
 * a given request should be routed to a persistence-backed handler. Extracted from app-factory.ts
 * (boy-scout rule: it sits at its size-ratchet ceiling) — these only reference `PlatformRequest`
 * and have no dependency on the rest of app-factory's wiring.
 */

export function isPersistenceCoreRoute(request: PlatformRequest): boolean {
  return request.path === "/auth/me" || request.path === "/projects" || (request.method === "DELETE" && /^\/projects\/[^/]+$/.test(request.path)) || request.path === "/audit-logs" || request.path === "/audit-logs/filter";
}

export function isNativeAuthRoute(request: PlatformRequest): boolean {
  return request.path === "/admin/users" || request.path === "/auth/login" || request.path === "/auth/change-password";
}

export function isPersistenceAiGovernanceRoute(request: PlatformRequest): boolean {
  return request.path === "/ai/providers" || request.path === "/ai/providers/status" || request.path === "/ai/providers/update" || request.path === "/ai/providers/delete" || request.path === "/ai/api-keys" || request.path === "/ai/api-keys/status" || request.path === "/ai/api-keys/delete" || request.path === "/ai/routes" || request.path === "/ai/quotas" || request.path === "/ai/provider-test-call" || request.path === "/ai/provider-catalog" || request.path === "/ai/usage" || request.path === "/guardrails/rules" || request.path === "/guardrails/test" || request.path === "/guardrails/events";
}

export function isPersistencePrdRoute(request: PlatformRequest): boolean {
  return /^\/projects\/[^/]+\/prd\/generate$/.test(request.path) || /^\/projects\/[^/]+\/prd\/baseline$/.test(request.path) || /^\/projects\/[^/]+\/prd\/versions$/.test(request.path) || /^\/projects\/[^/]+\/prd$/.test(request.path);
}

export function isPersistenceWorkspaceRoute(request: PlatformRequest): boolean {
  return /^\/projects\/[^/]+\/workspace$/.test(request.path) || /^\/projects\/[^/]+\/workspace\/prompts$/.test(request.path) || /^\/projects\/[^/]+\/workspace\/preview\/refresh$/.test(request.path);
}

export function isPersistencePublishStoreRoute(request: PlatformRequest): boolean {
  return /^\/projects\/[^/]+\/app\/users$/.test(request.path) || /^\/projects\/[^/]+\/app\/roles$/.test(request.path) || /^\/projects\/[^/]+\/app\/invitations$/.test(request.path) || /^\/projects\/[^/]+\/app\/access-requests$/.test(request.path) || /^\/projects\/[^/]+\/app\/access-requests\/decision$/.test(request.path) || /^\/projects\/[^/]+\/publish\/review$/.test(request.path) || /^\/projects\/[^/]+\/publish$/.test(request.path) || request.path === "/app-store/registry" || request.path === "/store/apps" || /^\/store\/apps\/[^/]+$/.test(request.path) || /^\/store\/apps\/[^/]+\/install$/.test(request.path) || /^\/store\/apps\/[^/]+\/uninstall$/.test(request.path) || /^\/store\/apps\/[^/]+\/access-requests$/.test(request.path) || /^\/store\/apps\/[^/]+\/tickets$/.test(request.path) || /^\/store\/tickets\/[^/]+$/.test(request.path) || /^\/creator\/projects\/[^/]+\/tickets$/.test(request.path);
}

export function isPersistenceGeneratedRuntimeRoute(request: PlatformRequest): boolean {
  return /^\/admin\/runtime\/projects\/[^/]+$/.test(request.path) || /^\/admin\/runtime\/projects\/[^/]+\/schema\/check$/.test(request.path) || /^\/admin\/runtime\/projects\/[^/]+\/health$/.test(request.path) || /^\/admin\/runtime\/projects\/[^/]+\/openapi$/.test(request.path) || /^\/admin\/runtime\/projects\/[^/]+\/migrations\/dry-run$/.test(request.path);
}
