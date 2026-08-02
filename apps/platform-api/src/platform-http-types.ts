import type { ApiResult } from "@evcp/api-client";

/**
 * Core HTTP request/response shapes for the platform API's request dispatcher. Extracted from
 * app-factory.ts (composition root) to keep that file under its size ratchet; app-factory.ts
 * re-exports these so existing importers (`from "../app-factory"` / `from "./app-factory"`)
 * keep working unchanged.
 */

export type HeaderBag = Record<string, string | string[] | undefined>;

export interface PlatformRequest {
  method: "GET" | "POST";
  path:
    | "/health"
    | "/auth/me"
    | "/auth/login"
    | "/auth/change-password"
    | "/admin/users"
    | "/projects"
    | "/audit-logs"
    | "/audit-logs/filter"
    | "/admin/monitoring"
    | "/admin/installer/preflight"
    | "/admin/installer/setup"
    | "/admin/installer/reports"
    | "/setup/status"
    | "/setup/initialize"
    | "/admin/business-settings"
    | "/admin/system/version"
    | "/admin/system/update"
    | "/admin/backup/policies"
    | "/admin/backup/runs"
    | "/admin/backup/pitr"
    | "/admin/backup/restore-drills"
    | "/admin/backup/overview"
    | "/admin/production/observability"
    | "/admin/production/upgrade-checks"
    | "/admin/production/rollback"
    | "/admin/production/overview"
    | "/admin/security/readiness"
    | "/admin/security/uploads/validate"
    | "/admin/security/release-checklist"
    | "/admin/security/redaction/preview"
    | "/admin/license/install"
    | "/admin/license/validate"
    | "/license/enforce"
    | "/admin/knowledge/sources"
    | `/admin/knowledge/sources/${string}/versions`
    | `/admin/knowledge/versions/${string}/approve`
    | "/admin/knowledge/retrieve"
    | "/admin/knowledge/retrieval-logs"
    | "/admin/skills"
    | `/admin/skills/${string}/versions`
    | `/admin/skills/${string}/disable`
    | `/admin/skills/versions/${string}/approve`
    | "/admin/skills/assignments"
    | "/admin/skills/resolve"
    | `/admin/runtime/projects/${string}`
    | `/admin/runtime/projects/${string}/schema/check`
    | `/admin/runtime/projects/${string}/health`
    | `/admin/runtime/projects/${string}/openapi`
    | `/admin/runtime/projects/${string}/migrations/dry-run`
    | "/admin/auth/providers"
    | "/admin/auth/providers/oidc"
    | "/admin/auth/providers/saml"
    | "/admin/auth/keycloak-defaults"
    | "/admin/auth/direct-idp-constraints"
    | "/admin/auth/simulate-login"
    | "/admin/auth/generated-app/validate-session"
    | "/admin/auth/break-glass"
    | "/admin/policy-templates"
    | "/admin/policy-templates/evaluate"
    | "/ai/providers"
    | "/ai/providers/status"
    | "/ai/providers/update"
    | "/ai/providers/delete"
    | "/ai/api-keys"
    | "/ai/api-keys/status"
    | "/ai/api-keys/delete"
    | "/ai/routes"
    | "/ai/quotas"
    | "/ai/provider-test-call"
    | "/ai/provider-catalog"
    | "/ai/usage"
    | "/guardrails/rules"
    | "/guardrails/test"
    | "/guardrails/events"
    | `/projects/${string}/prd`
    | `/projects/${string}/prd/generate`
    | `/projects/${string}/ai-jobs`
    | `/projects/${string}/ai-jobs/${string}`
    | `/projects/${string}/prd/baseline`
    | `/projects/${string}/prd/versions`
    | `/creator/projects/${string}/prd/changes`
    | `/creator/projects/${string}/prd/changes/from-ticket`
    | `/creator/projects/${string}/prd/changes/decision`
    | `/creator/projects/${string}/files`
    | `/creator/projects/${string}/files/init`
    | `/creator/projects/${string}/files/${string}/complete`
    | `/creator/projects/${string}/domains`
    | `/creator/projects/${string}/domains/requests`
    | `/creator/projects/${string}/traceability`
    | `/admin/domain-requests/${string}/decision`
    | `/projects/${string}/workspace`
    | `/projects/${string}/workspace/prompts`
    | `/projects/${string}/workspace/preview/refresh`
    | `/projects/${string}/workspace/container`
    | `/projects/${string}/workspace/container/stop`
    | `/projects/${string}/workspace/container/wake`
    | `/projects/${string}/database`
    | `/projects/${string}/database/sql`
    | `/projects/${string}/frontend/checkpoints`
    | `/projects/${string}/frontend/compare`
    | `/projects/${string}/frontend/restore`
    | `/projects/${string}/app/users`
    | `/projects/${string}/app/roles`
    | `/projects/${string}/app/invitations`
    | `/projects/${string}/app/access-requests`
    | `/projects/${string}/app/access-requests/decision`
    | `/projects/${string}/publish/review`
    | `/projects/${string}/publish`
    | "/app-store/registry"
    | "/store/apps"
    | `/store/apps/${string}`
    | `/store/apps/${string}/install`
    | `/store/apps/${string}/uninstall`
    | `/store/apps/${string}/access-requests`
    | `/store/apps/${string}/tickets`
    | `/store/tickets/${string}`
    | `/creator/projects/${string}/tickets`;
  headers?: HeaderBag;
  body?: Record<string, unknown>;
}

export interface PlatformResponse<T = unknown> {
  status: number;
  body: ApiResult<T>;
}
