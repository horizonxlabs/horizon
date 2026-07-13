import type { StoreAccessRequestResponse } from "@evcp/api-client";

export function fallbackAccessRequest(appSlug: string, requestedRoleKey: string, reason: string): StoreAccessRequestResponse {
  return { id: "local_access_request_001", appSlug, requestedRoleKey, requesterEmail: "user@company.com", status: "pending", reason, department: "HR", createdAt: new Date().toISOString() };
}
