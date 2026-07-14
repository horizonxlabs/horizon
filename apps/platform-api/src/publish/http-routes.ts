import type * as NodeHttp from "node:http";
import type { EnvironmentName } from "@evcp/types";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";
import type { MigrationStore } from "../generation-loop/migration-store";
import { resourceKeyForProject } from "../workspace-orchestrator/resource-ports";
import { createPublishRoutes, resolveAppsTarget } from "./routes";
import { createDefaultPublishStack } from "./factory";

interface PublishedProjectAccess {
  canAccessPublishedProject: (
    actor: NonNullable<WorkspaceAuthContext["actor"]>,
    projectId: string
  ) => Promise<boolean>;
}

export async function canAccessPublishedDeployment(
  auth: WorkspaceAuthContext,
  projectId: string,
  persistence?: PublishedProjectAccess
): Promise<boolean> {
  if (auth.projectIds.includes(projectId)) return true;
  if (!auth.actor || !persistence) return false;
  return persistence.canAccessPublishedProject(auth.actor, projectId);
}

type HeaderBag = Record<string, string | string[] | undefined>;

// Minimal raw-Express surface used by the publish + /apps serve handlers (mirrors the shape the
// app-factory infers from its Nest http adapter).
export interface PublishRawExpress {
  all: (
    path: string,
    handler: (
      req: {
        params: Record<string, string>;
        method: string;
        headers: HeaderBag;
        url: string;
        originalUrl: string;
        body?: unknown;
        on: (event: string, cb: (chunk: unknown) => void) => void;
      },
      res: {
        status: (code: number) => { json: (body: unknown) => void };
        statusCode: number;
        setHeader: (k: string, v: string | string[] | number) => void;
        end: (body?: unknown) => void;
        write: (chunk: unknown) => void;
        headersSent: boolean;
      }
    ) => void
  ) => void;
}

type PublishReq = Parameters<PublishRawExpress["all"]>[1] extends (
  req: infer Q,
  res: infer _S
) => void
  ? Q
  : never;
type PublishRes = Parameters<PublishRawExpress["all"]>[1] extends (
  req: infer _Q,
  res: infer S
) => void
  ? S
  : never;

function normalizeEnvironment(value: unknown): EnvironmentName {
  return value === "staging" || value === "dev" || value === "production" ? value : "production";
}

// Caddy's `handle_path /api/*` removes `/api` before this API sees the request. Deployed Next apps
// are built with EVCP_PREVIEW_BASE including that prefix, so reconstruct it for the upstream page
// and every asset request; omitting it makes Next resolve a non-existent root route and return 404.
export function deploymentProxyPath(originalUrl: string): string {
  return `/api${originalUrl || "/"}`;
}

/**
 * Register the container-publish HTTP routes on the raw Express instance:
 *   POST /projects/:projectId/publish     — deploy to an environment (body { environment, slug? })
 *   POST /projects/:projectId/rollback    — deploy an explicit older commit to an environment
 *   POST /projects/:projectId/promote     — promote healthy staging → production (no rebuild)
 *   GET  /projects/:projectId/deployments — list this project's deployments (both tiers)
 *   ALL  /apps/:slug[/*]                   — reverse-proxy the healthy PRODUCTION container
 *   ALL  /apps/:slug/staging[/*]          — reverse-proxy the healthy STAGING container
 *
 * NOTE (follow-up): public Caddy routing for `/apps/*` still points at the app-store PWA
 * (docker/Caddyfile) and is NOT changed here — these handlers are reachable directly on
 * platform-api (and via the dev `/api` proxy) for verification.
 */
export function registerPublishHttpRoutes(opts: {
  rawApp: PublishRawExpress;
  orchestrator: WorkspaceOrchestrator;
  migrations: MigrationStore;
  nodeHttp: typeof NodeHttp;
  env?: Record<string, string | undefined>;
  resolvePublishAuth: (headers: HeaderBag) => Promise<WorkspaceAuthContext | null>;
  canAccessDeployment: (auth: WorkspaceAuthContext, projectId: string) => Promise<boolean>;
  publishStack?: ReturnType<typeof createDefaultPublishStack>;
  recordAudit: (event: {
    action: string;
    projectId: string;
    metadata?: Record<string, unknown>;
  }) => void;
}): void {
  const { rawApp, orchestrator, nodeHttp } = opts;

  const {
    publishService,
    deployments: workspaceDeployments,
    rehydrateDeployment
  } = opts.publishStack ??
  createDefaultPublishStack({
    orchestrator,
    migrations: opts.migrations,
    env: opts.env,
    onAudit: opts.recordAudit
  });
  const publishRoutes = createPublishRoutes({ publishService, deployments: workspaceDeployments });

  // Publish containers are keyed by the immutable id-derived RESOURCE KEY (evcp-<env>-<resourceKey>),
  // NOT the project slug — projects no longer carry a resource-usable slug after the slug→UUID change.
  // This mirrors the dev container's `evcp-ws-<resourceKey>` naming so tiers line up.
  const resolveResourceKey = (projectId: string): string => resourceKeyForProject(projectId);

  const publishHandler = async (req: PublishReq, res: PublishRes) => {
    const auth = await opts.resolvePublishAuth(req.headers ?? {});
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const projectId = String(req.params?.projectId ?? "");
    const body = req.body as { environment?: unknown } | undefined;
    const slug = resolveResourceKey(projectId);
    const environment = normalizeEnvironment(body?.environment);
    try {
      const result = await publishRoutes.publish(auth, { projectId, slug, environment });
      res.status(result.status).json(result.body);
    } catch (error) {
      // Last-resort guard so an unexpected throw becomes a labelled, logged error instead of the
      // generic 500 the Nest filter emits (which hides the cause from prod deploy failures).
      console.error(`[publish] ${projectId} -> ${environment} failed:`, error);
      res
        .status(500)
        .json({ error: "publish_failed", message: (error as Error).message ?? "unknown error" });
    }
  };

  const rollbackHandler = async (req: PublishReq, res: PublishRes) => {
    const auth = await opts.resolvePublishAuth(req.headers ?? {});
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const projectId = String(req.params?.projectId ?? "");
    const body = req.body as { environment?: unknown; commitSha?: string } | undefined;
    const slug = resolveResourceKey(projectId);
    const environment = normalizeEnvironment(body?.environment);
    const commitSha = String(body?.commitSha ?? "");
    const result = await publishRoutes.rollback(auth, { projectId, slug, environment, commitSha });
    res.status(result.status).json(result.body);
  };

  const promoteHandler = async (req: PublishReq, res: PublishRes) => {
    const auth = await opts.resolvePublishAuth(req.headers ?? {});
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const projectId = String(req.params?.projectId ?? "");
    const slug = resolveResourceKey(projectId);
    const result = await publishRoutes.promote(auth, { projectId, slug });
    res.status(result.status).json(result.body);
  };

  const listDeploymentsHandler = async (req: PublishReq, res: PublishRes) => {
    const auth = await opts.resolvePublishAuth(req.headers ?? {});
    if (!auth) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const projectId = String(req.params?.projectId ?? "");
    const result = publishRoutes.list(auth, { projectId });
    res.status(result.status).json(result.body);
  };

  rawApp.all("/projects/:projectId/publish", publishHandler);
  rawApp.all("/projects/:projectId/rollback", rollbackHandler);
  rawApp.all("/projects/:projectId/promote", promoteHandler);
  rawApp.all("/projects/:projectId/deployments", listDeploymentsHandler);

  // Public reverse proxy to a healthy deployment for the given environment. Publishing endpoints
  // above remain authenticated. Deployed apps receive their full base-path URL so Next can match
  // the EVCP_PREVIEW_BASE that was compiled into the image.
  const makeAppsHandler =
    (environment: EnvironmentName) => async (req: PublishReq, res: PublishRes) => {
      const auth = await opts.resolvePublishAuth(req.headers ?? {});
      if (!auth) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const slug = String(req.params?.slug ?? "");
      const decision = await resolveAppsTarget(workspaceDeployments, slug, environment, () =>
        rehydrateDeployment(slug, environment)
      );
      if (!decision.ok) {
        res.status(decision.status).json({ error: "app_unavailable" });
        return;
      }
      if (!(await opts.canAccessDeployment(auth, decision.projectId))) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const target = new URL(decision.upstream);
      const forwardPath = deploymentProxyPath(req.originalUrl);
      const forwardHeaders: HeaderBag = { ...req.headers, host: target.host };
      for (const key of Object.keys(forwardHeaders)) {
        if (key.toLowerCase() === "authorization" || key.toLowerCase() === "cookie") {
          delete forwardHeaders[key];
        }
      }
      const proxyReq = nodeHttp.request(
        {
          hostname: target.hostname,
          port: target.port || 80,
          method: req.method,
          path: forwardPath,
          headers: forwardHeaders
        },
        (proxyRes) => {
          res.statusCode = proxyRes.statusCode ?? 502;
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) res.setHeader(key, value as string | string[]);
          }
          proxyRes.pipe(res as unknown as NodeJS.WritableStream);
        }
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).json({ error: "app_upstream_unreachable" });
      });
      const method = String(req.method ?? "GET").toUpperCase();
      if (method === "GET" || method === "HEAD" || req.body === undefined || req.body === null) {
        proxyReq.end();
      } else {
        const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        proxyReq.setHeader("content-type", "application/json");
        proxyReq.setHeader("content-length", Buffer.byteLength(payload));
        proxyReq.write(payload);
        proxyReq.end();
      }
    };

  // Staging serve routes must be registered BEFORE the production `/apps/:slug` routes so the more
  // specific `/apps/:slug/staging` path wins.
  const stagingHandler = makeAppsHandler("staging");
  rawApp.all("/apps/:slug/staging", stagingHandler);
  rawApp.all("/apps/:slug/staging/*splat", stagingHandler);

  const productionHandler = makeAppsHandler("production");
  rawApp.all("/apps/:slug", productionHandler);
  rawApp.all("/apps/:slug/*splat", productionHandler);
}
