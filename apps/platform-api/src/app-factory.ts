import "reflect-metadata";
import { HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import type { ApiResult } from "@evcp/api-client";
import { PlatformApiModule } from "./platform-api.module";
import { createPlatformApiServices, type PlatformApiServices } from "./platform-services";

type HeaderBag = Record<string, string | string[] | undefined>;

type HttpRequest = {
  headers: HeaderBag;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
};

type RouteRegistry = {
  get: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void) => void;
  post: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void) => void;
};

export interface PlatformRequest {
  method: "GET" | "POST";
  path:
    | "/health"
    | "/auth/me"
    | "/projects"
    | "/audit-logs"
    | "/audit-logs/filter"
    | "/admin/monitoring"
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
    | "/ai/api-keys"
    | "/ai/routes"
    | "/ai/quotas"
    | "/guardrails/rules"
    | "/guardrails/test"
    | "/guardrails/events"
    | `/projects/${string}/prd`
    | `/projects/${string}/prd/generate`
    | `/projects/${string}/prd/baseline`
    | `/projects/${string}/prd/versions`
    | `/creator/projects/${string}/prd/changes`
    | `/creator/projects/${string}/prd/changes/from-ticket`
    | `/creator/projects/${string}/prd/changes/decision`
    | `/creator/projects/${string}/domains`
    | `/creator/projects/${string}/domains/requests`
    | `/creator/projects/${string}/traceability`
    | `/admin/domain-requests/${string}/decision`
    | `/projects/${string}/workspace`
    | `/projects/${string}/workspace/prompts`
    | `/projects/${string}/workspace/preview/refresh`
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

function errorResponse(error: unknown): PlatformResponse {
  if (error instanceof Error && error.name === "MockAuthError") {
    return { status: HttpStatus.UNAUTHORIZED, body: failure("UNAUTHORIZED", error.message) };
  }

  if (error instanceof Error && error.name === "PermissionError") {
    return { status: HttpStatus.FORBIDDEN, body: failure("FORBIDDEN", error.message) };
  }

  if (error instanceof Error && error.name === "ValidationError") {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: failure("VALIDATION_ERROR", error.message) };
  }

  if (error instanceof Error && error.name === "ConflictError") {
    return { status: HttpStatus.CONFLICT, body: failure("CONFLICT", error.message) };
  }

  if (error instanceof Error && error.name === "QuotaExceededError") {
    return { status: HttpStatus.TOO_MANY_REQUESTS, body: failure("QUOTA_EXCEEDED", error.message) };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: failure("INTERNAL_ERROR", "Unexpected platform API error") };
}

function sendPlatformResponse(response: HttpResponse, platformResponse: PlatformResponse): void {
  response.status(platformResponse.status).json(platformResponse.body);
}

export function executePlatformApiRequest(services: PlatformApiServices, request: PlatformRequest): PlatformResponse {
  try {
    if (request.method === "GET" && request.path === "/health") {
      return {
        status: HttpStatus.OK,
        body: success({
          service: "platform-api",
          status: "healthy",
          dependencies: {
            database: "configured",
            authMode: "mock"
          }
        })
      };
    }

    if (request.method === "GET" && request.path === "/auth/me") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});

      services.audit.record({
        actorId: user.id,
        action: "auth.me",
        resourceType: "platform_user",
        resourceId: user.id
      });

      return {
        status: HttpStatus.OK,
        body: success({
          user,
          permissions: user.permissions
        })
      };
    }

    if (request.method === "GET" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin", "creator"]);
      return { status: HttpStatus.OK, body: success(services.projects.listProjects(user)) };
    }

    if (request.method === "POST" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const project = services.projects.createProject({
        actor: user,
        name: String(request.body?.name ?? "Untitled Project"),
        slug: String(request.body?.slug ?? "untitled-project"),
        appType: request.body?.appType ? String(request.body.appType) : undefined,
        businessProblem: request.body?.businessProblem ? String(request.body.businessProblem) : undefined,
        targetDepartment: request.body?.targetDepartment ? String(request.body.targetDepartment) : undefined,
        intendedUsers: Array.isArray(request.body?.intendedUsers) ? request.body.intendedUsers.map(String) : undefined,
        dataSensitivity: request.body?.dataSensitivity ? (String(request.body.dataSensitivity) as never) : undefined
      });

      return { status: HttpStatus.CREATED, body: success(project) };
    }

    const prdGenerateMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/generate$/);
    if (request.method === "POST" && prdGenerateMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const draft = services.prds.generateDraft(user, prdGenerateMatch[1]);
      return { status: HttpStatus.CREATED, body: success(draft) };
    }

    const prdBaselineMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/baseline$/);
    if (request.method === "POST" && prdBaselineMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const baseline = services.prds.confirmBaseline(user, prdBaselineMatch[1], String(request.body?.versionId ?? ""));
      return { status: HttpStatus.OK, body: success(baseline) };
    }

    const prdVersionsMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/versions$/);
    if (request.method === "GET" && prdVersionsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.listVersions(user, prdVersionsMatch[1])) };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (request.method === "GET" && prdCurrentMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.getCurrent(user, prdCurrentMatch[1])) };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (request.method === "POST" && workspacePromptMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.workspace.submitPrompt(user, workspacePromptMatch[1], {
        prompt: String(request.body?.prompt ?? "")
      });
      return {
        status: result.guardrail.decision === "block" ? HttpStatus.OK : HttpStatus.CREATED,
        body: success(result)
      };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (request.method === "POST" && workspaceRefreshMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.refreshPreview(user, workspaceRefreshMatch[1])) };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (request.method === "GET" && workspaceMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.getWorkspace(user, workspaceMatch[1])) };
    }

    const databaseMatch = request.path.match(/^\/projects\/([^/]+)\/database$/);
    if (request.method === "GET" && databaseMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.databaseView.getDatabaseView(user, databaseMatch[1])) };
    }

    const databaseSqlMatch = request.path.match(/^\/projects\/([^/]+)\/database\/sql$/);
    if (request.method === "POST" && databaseSqlMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.databaseView.executeRawSql(user, databaseSqlMatch[1], String(request.body?.sql ?? ""));
    }

    const frontendCheckpointsMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/checkpoints$/);
    if (request.method === "GET" && frontendCheckpointsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.frontendVersions.getTimeline(user, frontendCheckpointsMatch[1])) };
    }

    const frontendCompareMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/compare$/);
    if (request.method === "POST" && frontendCompareMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.frontendVersions.compareCheckpoints(user, frontendCompareMatch[1], {
            fromCheckpointId: String(request.body?.fromCheckpointId ?? ""),
            toCheckpointId: request.body?.toCheckpointId ? String(request.body.toCheckpointId) : undefined
          })
        )
      };
    }

    const frontendRestoreMatch = request.path.match(/^\/projects\/([^/]+)\/frontend\/restore$/);
    if (request.method === "POST" && frontendRestoreMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(services.frontendVersions.restoreFrontend(user, frontendRestoreMatch[1], String(request.body?.checkpointId ?? "")))
      };
    }

    const appUsersMatch = request.path.match(/^\/projects\/([^/]+)\/app\/users$/);
    if (request.method === "GET" && appUsersMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.appAccess.getSnapshot(user, appUsersMatch[1])) };
    }

    const appRolesMatch = request.path.match(/^\/projects\/([^/]+)\/app\/roles$/);
    if (request.method === "POST" && appRolesMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const role = services.appAccess.createRole(user, appRolesMatch[1], {
        key: String(request.body?.key ?? ""),
        name: String(request.body?.name ?? ""),
        description: request.body?.description ? String(request.body.description) : undefined,
        permissions: Array.isArray(request.body?.permissions) ? request.body.permissions.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(role) };
    }

    const appInvitationsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/invitations$/);
    if (request.method === "POST" && appInvitationsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const invitation = services.appAccess.createInvitation(user, appInvitationsMatch[1], {
        email: String(request.body?.email ?? ""),
        roleKey: String(request.body?.roleKey ?? ""),
        userType: String(request.body?.userType ?? "internal") as never,
        expiresAt: request.body?.expiresAt ? String(request.body.expiresAt) : undefined,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(invitation) };
    }

    const appAccessRequestsMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests$/);
    if (request.method === "POST" && appAccessRequestsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.appAccess.createAccessRequest(user, appAccessRequestsMatch[1], {
        requesterEmail: String(request.body?.requesterEmail ?? ""),
        requestedRoleKey: String(request.body?.requestedRoleKey ?? ""),
        reason: String(request.body?.reason ?? "")
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const appAccessDecisionMatch = request.path.match(/^\/projects\/([^/]+)\/app\/access-requests\/decision$/);
    if (request.method === "POST" && appAccessDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.appAccess.decideAccessRequest(user, appAccessDecisionMatch[1], {
        requestId: String(request.body?.requestId ?? ""),
        decision: String(request.body?.decision ?? "approved") as never,
        decidedByUserId: request.body?.decidedByUserId ? String(request.body.decidedByUserId) : undefined
      });
      return { status: HttpStatus.OK, body: success(accessRequest) };
    }

    const publishReviewMatch = request.path.match(/^\/projects\/([^/]+)\/publish\/review$/);
    if (request.method === "GET" && publishReviewMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.publish.getReview(user, publishReviewMatch[1])) };
    }

    const publishMatch = request.path.match(/^\/projects\/([^/]+)\/publish$/);
    if (request.method === "POST" && publishMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.CREATED, body: success(services.publish.publishApp(user, publishMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/app-store/registry") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.publish.listRegistry(user)) };
    }

    if (request.method === "GET" && request.path === "/store/apps") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.storefront.listApps(user)) };
    }

    const storeAccessMatch = request.path.match(/^\/store\/apps\/([^/]+)\/access-requests$/);
    if (request.method === "POST" && storeAccessMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const accessRequest = services.storefront.requestAccess(user, storeAccessMatch[1], {
        requestedRoleKey: String(request.body?.requestedRoleKey ?? ""),
        reason: String(request.body?.reason ?? ""),
        department: request.body?.department ? String(request.body.department) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(accessRequest) };
    }

    const storeTicketCreateMatch = request.path.match(/^\/store\/apps\/([^/]+)\/tickets$/);
    if (request.method === "POST" && storeTicketCreateMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const ticket = services.tickets.createTicket(user, storeTicketCreateMatch[1], {
        type: String(request.body?.type ?? "bug") as never,
        priority: String(request.body?.priority ?? "medium") as never,
        title: String(request.body?.title ?? ""),
        description: String(request.body?.description ?? ""),
        deviceInfo: String(request.body?.deviceInfo ?? ""),
        screenshotUrl: request.body?.screenshotUrl ? String(request.body.screenshotUrl) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(ticket) };
    }

    const storeAppDetailMatch = request.path.match(/^\/store\/apps\/([^/]+)$/);
    if (request.method === "GET" && storeAppDetailMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.storefront.getAppDetail(user, storeAppDetailMatch[1])) };
    }

    const storeTicketStatusMatch = request.path.match(/^\/store\/tickets\/([^/]+)$/);
    if (request.method === "GET" && storeTicketStatusMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.tickets.getTicketStatus(user, storeTicketStatusMatch[1])) };
    }

    const creatorTicketInboxMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/tickets$/);
    if (request.method === "GET" && creatorTicketInboxMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.tickets.listCreatorInbox(user, creatorTicketInboxMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/audit-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.audit.list()) };
    }

    if (request.method === "POST" && request.path === "/audit-logs/filter") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return {
        status: HttpStatus.OK,
        body: success(
          services.audit.filter({
            actorId: request.body?.actorId ? String(request.body.actorId) : undefined,
            action: request.body?.action ? String(request.body.action) : undefined,
            projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
            appId: request.body?.appId ? String(request.body.appId) : undefined,
            severity: request.body?.severity ? (String(request.body.severity) as never) : undefined,
            dateFrom: request.body?.dateFrom ? String(request.body.dateFrom) : undefined,
            dateTo: request.body?.dateTo ? String(request.body.dateTo) : undefined
          })
        )
      };
    }

    if (request.method === "GET" && request.path === "/admin/knowledge/sources") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.knowledge.listSources(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/knowledge/sources") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const source = services.knowledge.createSource(user, {
        title: String(request.body?.title ?? ""),
        sourceType: String(request.body?.sourceType ?? "text") as never,
        ownerUserId: String(request.body?.ownerUserId ?? user.id),
        scope: (request.body?.scope ?? { visibility: "global" }) as never,
        uploadStatus: request.body?.uploadStatus ? (String(request.body.uploadStatus) as never) : undefined,
        indexStatus: request.body?.indexStatus ? (String(request.body.indexStatus) as never) : undefined,
        tags: Array.isArray(request.body?.tags) ? request.body.tags.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(source) };
    }

    const knowledgeVersionMatch = request.path.match(/^\/admin\/knowledge\/sources\/([^/]+)\/versions$/);
    if (request.method === "POST" && knowledgeVersionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const version = services.knowledge.submitVersion(user, knowledgeVersionMatch[1], {
        version: request.body?.version ? String(request.body.version) : undefined,
        contentHash: String(request.body?.contentHash ?? ""),
        changelog: String(request.body?.changelog ?? ""),
        chunkCount: Number(request.body?.chunkCount ?? 0),
        excerpts: Array.isArray(request.body?.excerpts) ? request.body.excerpts.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(version) };
    }

    const knowledgeApproveMatch = request.path.match(/^\/admin\/knowledge\/versions\/([^/]+)\/approve$/);
    if (request.method === "POST" && knowledgeApproveMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.knowledge.approveVersion(user, {
        versionId: knowledgeApproveMatch[1],
        decision: String(request.body?.decision ?? "approved") as never,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/knowledge/retrieve") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.knowledge.retrieve(user, {
        projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
        appId: request.body?.appId ? String(request.body.appId) : undefined,
        department: request.body?.department ? String(request.body.department) : undefined,
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never,
        query: request.body?.query ? String(request.body.query) : undefined,
        requiredKnowledgeSourceIds: Array.isArray(request.body?.requiredKnowledgeSourceIds) ? request.body.requiredKnowledgeSourceIds.map(String) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/knowledge/retrieval-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.knowledge.listRetrievalLogs(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/skills") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.skills.listSkills(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/skills") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const skill = services.skills.createSkill(user, {
        key: String(request.body?.key ?? ""),
        name: String(request.body?.name ?? ""),
        description: request.body?.description ? String(request.body.description) : undefined,
        ownerUserId: String(request.body?.ownerUserId ?? user.id)
      });
      return { status: HttpStatus.CREATED, body: success(skill) };
    }

    const skillVersionMatch = request.path.match(/^\/admin\/skills\/([^/]+)\/versions$/);
    if (request.method === "POST" && skillVersionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const version = services.skills.submitVersion(user, skillVersionMatch[1], {
        version: request.body?.version ? String(request.body.version) : undefined,
        instruction: String(request.body?.instruction ?? ""),
        inputSchema: (request.body?.inputSchema ?? {}) as Record<string, unknown>,
        outputSchema: (request.body?.outputSchema ?? {}) as Record<string, unknown>,
        requiredKnowledgeSourceIds: Array.isArray(request.body?.requiredKnowledgeSourceIds) ? request.body.requiredKnowledgeSourceIds.map(String) : undefined,
        allowedTools: Array.isArray(request.body?.allowedTools) ? request.body.allowedTools.map(String) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(version) };
    }

    const skillApproveMatch = request.path.match(/^\/admin\/skills\/versions\/([^/]+)\/approve$/);
    if (request.method === "POST" && skillApproveMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.skills.approveVersion(user, {
        versionId: skillApproveMatch[1],
        decision: String(request.body?.decision ?? "approved") as never,
        note: request.body?.note ? String(request.body.note) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    const skillDisableMatch = request.path.match(/^\/admin\/skills\/([^/]+)\/disable$/);
    if (request.method === "POST" && skillDisableMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const skill = services.skills.disableSkill(user, skillDisableMatch[1], String(request.body?.reason ?? ""));
      return { status: HttpStatus.OK, body: success(skill) };
    }

    if (request.method === "POST" && request.path === "/admin/skills/assignments") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const assignment = services.skills.assign(user, {
        skillVersionId: String(request.body?.skillVersionId ?? ""),
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never,
        scopeType: String(request.body?.scopeType ?? "global") as never,
        scopeId: String(request.body?.scopeId ?? "global"),
        priority: Number(request.body?.priority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(assignment) };
    }

    if (request.method === "POST" && request.path === "/admin/skills/resolve") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.skills.resolve(user, {
        projectId: request.body?.projectId ? String(request.body.projectId) : undefined,
        appId: request.body?.appId ? String(request.body.appId) : undefined,
        department: request.body?.department ? String(request.body.department) : undefined,
        agentRole: String(request.body?.agentRole ?? "frontend_developer") as never,
        scenario: String(request.body?.scenario ?? "frontend_coding") as never
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/admin/monitoring") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.monitoring.getDashboard(user)) };
    }

    const runtimeOverviewMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)$/);
    if (request.method === "GET" && runtimeOverviewMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOverviewMatch[1])) };
    }

    const runtimeSchemaCheckMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/schema\/check$/);
    if (request.method === "POST" && runtimeSchemaCheckMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.generatedRuntime.checkSchemaAccess(user, runtimeSchemaCheckMatch[1], {
            attemptedSchema: String(request.body?.attemptedSchema ?? ""),
            operation: String(request.body?.operation ?? "select")
          })
        )
      };
    }

    const runtimeHealthMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/health$/);
    if (request.method === "GET" && runtimeHealthMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const runtime = services.generatedRuntime.getRuntimeOverview(user, runtimeHealthMatch[1]);
      return {
        status: HttpStatus.OK,
        body: success({
          health: runtime.health,
          readiness: runtime.readiness,
          metrics: runtime.metrics,
          logSample: runtime.logSample
        })
      };
    }

    const runtimeOpenApiMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/openapi$/);
    if (request.method === "GET" && runtimeOpenApiMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.generatedRuntime.getRuntimeOverview(user, runtimeOpenApiMatch[1]).openApi) };
    }

    const runtimeMigrationDryRunMatch = request.path.match(/^\/admin\/runtime\/projects\/([^/]+)\/migrations\/dry-run$/);
    if (request.method === "POST" && runtimeMigrationDryRunMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.generatedRuntime.runMigrationDryRun(user, runtimeMigrationDryRunMatch[1], {
            migrationId: String(request.body?.migrationId ?? ""),
            destructiveChanges: Array.isArray(request.body?.destructiveChanges) ? request.body.destructiveChanges.map(String) : [],
            approvalId: request.body?.approvalId ? String(request.body.approvalId) : undefined
          })
        )
      };
    }

    if (request.method === "GET" && request.path === "/admin/auth/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.listProviders(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/providers/oidc") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.authSso.createOidcProvider(user, {
        name: String(request.body?.name ?? ""),
        issuerUrl: String(request.body?.issuerUrl ?? ""),
        clientId: String(request.body?.clientId ?? ""),
        clientSecret: String(request.body?.clientSecret ?? ""),
        scopes: Array.isArray(request.body?.scopes) ? request.body.scopes.map(String) : [],
        groupRoleMapping: (request.body?.groupRoleMapping ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/providers/saml") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.authSso.createSamlProvider(user, {
        name: String(request.body?.name ?? ""),
        entityId: String(request.body?.entityId ?? ""),
        ssoUrl: String(request.body?.ssoUrl ?? ""),
        certificate: String(request.body?.certificate ?? ""),
        groupRoleMapping: (request.body?.groupRoleMapping ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "GET" && request.path === "/admin/auth/keycloak-defaults") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.getKeycloakDefaults(user)) };
    }

    if (request.method === "GET" && request.path === "/admin/auth/direct-idp-constraints") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.authSso.getDirectIdpConstraints(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/simulate-login") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const session = services.authSso.simulateLogin(user, {
        providerId: String(request.body?.providerId ?? ""),
        subject: String(request.body?.subject ?? ""),
        email: String(request.body?.email ?? ""),
        name: String(request.body?.name ?? ""),
        groups: Array.isArray(request.body?.groups) ? request.body.groups.map(String) : [],
        appRoles: (request.body?.appRoles ?? {}) as never
      });
      return { status: HttpStatus.CREATED, body: success(session) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/generated-app/validate-session") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      const result = services.authSso.validateGeneratedAppSession(String(request.body?.token ?? ""), {
        appSlug: String(request.body?.appSlug ?? ""),
        requiredRole: request.body?.requiredRole ? String(request.body.requiredRole) : undefined
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "POST" && request.path === "/admin/auth/break-glass") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const session = services.breakGlass.login(user, {
        reason: String(request.body?.reason ?? ""),
        ticketRef: request.body?.ticketRef ? String(request.body.ticketRef) : undefined
      });
      return { status: HttpStatus.CREATED, body: success(session) };
    }

    if (request.method === "GET" && request.path === "/admin/policy-templates") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.policyTemplates.listTemplates(user)) };
    }

    if (request.method === "POST" && request.path === "/admin/policy-templates/evaluate") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(
          services.policyTemplates.evaluate(user, {
            classification: String(request.body?.classification ?? "internal") as never,
            action: String(request.body?.action ?? "")
          })
        )
      };
    }

    const prdChangesMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes$/);
    if (request.method === "GET" && prdChangesMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prdChanges.listChanges(user, prdChangesMatch[1])) };
    }

    const prdChangeFromTicketMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes\/from-ticket$/);
    if (request.method === "POST" && prdChangeFromTicketMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const change = services.prdChanges.convertTicketToChange(user, prdChangeFromTicketMatch[1], {
        ticketId: String(request.body?.ticketId ?? ""),
        title: String(request.body?.title ?? ""),
        proposedRequirement: String(request.body?.proposedRequirement ?? ""),
        affectedSections: Array.isArray(request.body?.affectedSections) ? request.body.affectedSections.map(String) : [],
        acceptanceCriteria: Array.isArray(request.body?.acceptanceCriteria) ? request.body.acceptanceCriteria.map(String) : [],
        riskLevel: String(request.body?.riskLevel ?? "medium") as never
      });
      return { status: HttpStatus.CREATED, body: success(change) };
    }

    const prdChangeDecisionMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/prd\/changes\/decision$/);
    if (request.method === "POST" && prdChangeDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const decision = services.prdChanges.decideChange(user, prdChangeDecisionMatch[1], {
        changeId: String(request.body?.changeId ?? ""),
        decision: String(request.body?.decision ?? "approved") as never,
        note: String(request.body?.note ?? "")
      });
      return { status: HttpStatus.OK, body: success(decision) };
    }

    const domainSettingsMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/domains$/);
    if (request.method === "GET" && domainSettingsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.domains.getSettings(user, domainSettingsMatch[1])) };
    }

    const domainRequestMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/domains\/requests$/);
    if (request.method === "POST" && domainRequestMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const requestRecord = services.domains.requestPublicDomain(user, domainRequestMatch[1], {
        domain: String(request.body?.domain ?? ""),
        reason: String(request.body?.reason ?? ""),
        intendedAudience: String(request.body?.intendedAudience ?? ""),
        dataClassification: String(request.body?.dataClassification ?? "internal") as never,
        externalUserPolicy: String(request.body?.externalUserPolicy ?? ""),
        checklistAccepted: Boolean(request.body?.checklistAccepted ?? false)
      });
      return { status: HttpStatus.CREATED, body: success(requestRecord) };
    }

    const domainDecisionMatch = request.path.match(/^\/admin\/domain-requests\/([^/]+)\/decision$/);
    if (request.method === "POST" && domainDecisionMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const requestRecord = services.domains.decideDomainRequest(user, domainDecisionMatch[1], {
        decision: String(request.body?.decision ?? "approved") as never,
        note: String(request.body?.note ?? "")
      });
      return { status: HttpStatus.OK, body: success(requestRecord) };
    }

    const traceabilityMatch = request.path.match(/^\/creator\/projects\/([^/]+)\/traceability$/);
    if (request.method === "GET" && traceabilityMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.traceability.getProjectTrace(user, traceabilityMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listProviders()) };
    }

    if (request.method === "POST" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.aiGovernance.createProvider(user, {
        name: String(request.body?.name ?? ""),
        adapter: String(request.body?.adapter ?? "mock") as never,
        baseUrl: String(request.body?.baseUrl ?? ""),
        models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "GET" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listApiKeys()) };
    }

    if (request.method === "POST" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const key = services.aiGovernance.createApiKey(user, {
        providerId: String(request.body?.providerId ?? ""),
        name: String(request.body?.name ?? ""),
        secret: String(request.body?.secret ?? ""),
        usageMode: String(request.body?.usageMode ?? "production") as never,
        quotaTokens: Number(request.body?.quotaTokens ?? 0),
        fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(key) };
    }

    if (request.method === "POST" && request.path === "/ai/routes") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const route = services.aiGovernance.configureRoute(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        primaryProviderId: String(request.body?.primaryProviderId ?? ""),
        primaryModel: String(request.body?.primaryModel ?? ""),
        fallbackProviderId: request.body?.fallbackProviderId ? String(request.body.fallbackProviderId) : undefined,
        fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
      });
      return { status: HttpStatus.OK, body: success(route) };
    }

    if (request.method === "POST" && request.path === "/ai/quotas") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const quota = services.aiGovernance.configureQuota(user, {
        scope: String(request.body?.scope ?? "organization") as never,
        dailyLimit: Number(request.body?.dailyLimit ?? 0),
        monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
        warningThreshold: Number(request.body?.warningThreshold ?? 0),
        hardStop: Boolean(request.body?.hardStop ?? true),
        usedToday: Number(request.body?.usedToday ?? 0)
      });
      return { status: HttpStatus.OK, body: success(quota) };
    }

    if (request.method === "POST" && request.path === "/guardrails/rules") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const rule = services.guardrails.createRule(user, {
        name: String(request.body?.name ?? ""),
        type: String(request.body?.type ?? "keyword") as never,
        pattern: String(request.body?.pattern ?? ""),
        severity: String(request.body?.severity ?? "warning") as never,
        action: String(request.body?.action ?? "warn") as never,
        scope: String(request.body?.scope ?? "organization") as never
      });
      return { status: HttpStatus.CREATED, body: success(rule) };
    }

    if (request.method === "POST" && request.path === "/guardrails/test") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.guardrails.testPrompt(user, {
        prompt: String(request.body?.prompt ?? ""),
        scenario: String(request.body?.scenario ?? "prd_generation")
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/guardrails/events") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.guardrails.listEvents()) };
    }

    return { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "Unknown platform API route") };
  } catch (error) {
    return errorResponse(error);
  }
}

function registerPlatformRoutes(app: INestApplication, services: PlatformApiServices): void {
  const routes = app.getHttpAdapter().getInstance() as RouteRegistry;

  routes.get("/health", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/health", headers: request.headers }))
  );
  routes.get("/auth/me", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/auth/me", headers: request.headers }))
  );
  routes.get("/projects", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/projects", headers: request.headers }))
  );
  routes.post("/projects", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/projects", headers: request.headers, body: request.body })
    )
  );
  routes.get("/audit-logs", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/audit-logs", headers: request.headers }))
  );
  routes.post("/audit-logs/filter", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/audit-logs/filter", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/knowledge/sources", headers: request.headers }))
  );
  routes.post("/admin/knowledge/sources", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/knowledge/sources", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/knowledge/sources/:sourceId/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/knowledge/sources/${String(request.params?.sourceId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/versions/:versionId/approve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/knowledge/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/knowledge/retrieve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/knowledge/retrieve", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/knowledge/retrieval-logs", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/knowledge/retrieval-logs", headers: request.headers }))
  );
  routes.get("/admin/skills", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/skills", headers: request.headers }))
  );
  routes.post("/admin/skills", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/skills", headers: request.headers, body: request.body }))
  );
  routes.post("/admin/skills/:skillId/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/versions`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/versions/:versionId/approve", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/versions/${String(request.params?.versionId ?? "")}/approve`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/:skillId/disable", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/skills/${String(request.params?.skillId ?? "")}/disable`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/skills/assignments", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/skills/assignments", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/skills/resolve", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "POST", path: "/admin/skills/resolve", headers: request.headers, body: request.body }))
  );
  routes.get("/admin/monitoring", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/monitoring", headers: request.headers }))
  );
  routes.get("/admin/runtime/projects/:projectId", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.post("/admin/runtime/projects/:projectId/schema/check", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/schema/check`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/admin/runtime/projects/:projectId/health", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/health`,
        headers: request.headers
      })
    )
  );
  routes.get("/admin/runtime/projects/:projectId/openapi", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/openapi`,
        headers: request.headers
      })
    )
  );
  routes.post("/admin/runtime/projects/:projectId/migrations/dry-run", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/runtime/projects/${String(request.params?.projectId ?? "")}/migrations/dry-run`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/prd/generate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/generate`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/prd/baseline", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/baseline`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/prd/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/versions`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/prd", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd`,
        headers: request.headers
      })
    )
  );
  routes.get("/creator/projects/:projectId/prd/changes", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes`,
        headers: request.headers
      })
    )
  );
  routes.post("/creator/projects/:projectId/prd/changes/from-ticket", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes/from-ticket`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/creator/projects/:projectId/prd/changes/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/prd/changes/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/creator/projects/:projectId/domains", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/domains`,
        headers: request.headers
      })
    )
  );
  routes.post("/creator/projects/:projectId/domains/requests", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/domains/requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/domain-requests/:requestId/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/admin/domain-requests/${String(request.params?.requestId ?? "")}/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/creator/projects/:projectId/traceability", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/traceability`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/workspace", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/workspace/prompts", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/prompts`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/workspace/preview/refresh", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/preview/refresh`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/database", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/database`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/database/sql", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/database/sql`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/frontend/checkpoints", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/checkpoints`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/frontend/compare", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/compare`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/frontend/restore", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/frontend/restore`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/app/users", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/users`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/app/roles", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/roles`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/invitations", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/invitations`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/app/access-requests/decision", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/app/access-requests/decision`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/publish/review", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/publish/review`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/publish", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/publish`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/app-store/registry", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/app-store/registry", headers: request.headers }))
  );
  routes.get("/store/apps", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/store/apps", headers: request.headers }))
  );
  routes.get("/store/apps/:appSlug", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.post("/store/apps/:appSlug/access-requests", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/access-requests`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/store/apps/:appSlug/tickets", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/store/apps/${String(request.params?.appSlug ?? "")}/tickets`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/store/tickets/:ticketId", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/store/tickets/${String(request.params?.ticketId ?? "")}`,
        headers: request.headers
      })
    )
  );
  routes.get("/creator/projects/:projectId/tickets", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/creator/projects/${String(request.params?.projectId ?? "")}/tickets`,
        headers: request.headers
      })
    )
  );
  routes.get("/admin/auth/providers", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/providers", headers: request.headers }))
  );
  routes.post("/admin/auth/providers/oidc", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/providers/oidc", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/auth/providers/saml", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/providers/saml", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/auth/keycloak-defaults", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/keycloak-defaults", headers: request.headers }))
  );
  routes.get("/admin/auth/direct-idp-constraints", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "GET", path: "/admin/auth/direct-idp-constraints", headers: request.headers })
    )
  );
  routes.post("/admin/auth/simulate-login", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/simulate-login", headers: request.headers, body: request.body })
    )
  );
  routes.post("/admin/auth/generated-app/validate-session", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: "/admin/auth/generated-app/validate-session",
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/admin/auth/break-glass", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/auth/break-glass", headers: request.headers, body: request.body })
    )
  );
  routes.get("/admin/policy-templates", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/admin/policy-templates", headers: request.headers }))
  );
  routes.post("/admin/policy-templates/evaluate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/admin/policy-templates/evaluate", headers: request.headers, body: request.body })
    )
  );
  routes.get("/ai/providers", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/providers", headers: request.headers }))
  );
  routes.post("/ai/providers", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/providers", headers: request.headers, body: request.body })
    )
  );
  routes.get("/ai/api-keys", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/api-keys", headers: request.headers }))
  );
  routes.post("/ai/api-keys", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/api-keys", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/routes", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/routes", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/quotas", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/quotas", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/rules", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/rules", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/test", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/test", headers: request.headers, body: request.body })
    )
  );
  routes.get("/guardrails/events", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/guardrails/events", headers: request.headers }))
  );
}

export async function createPlatformApiApp(services: PlatformApiServices = createPlatformApiServices()): Promise<INestApplication> {
  const app = await NestFactory.create(PlatformApiModule, {
    logger: false
  });

  app.enableCors({
    origin: true,
    credentials: true
  });
  registerPlatformRoutes(app, services);

  return app;
}
