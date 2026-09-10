import { failure, success } from "@evcp/api-client";
import { registerPreviewSessionRoute } from "./preview-session-route";
import type { WorkspaceOrchestrator } from "./orchestrator";

type Headers = Record<string, string | string[] | undefined>;
type Response = {
  status(code: number): Response;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
};
type Handler = (
  request: { headers: Headers; params?: Record<string, string> },
  response: Response
) => Promise<void>;
export function registerWorkspacePreviewHttp(input: {
  routes: { get(path: string, handler: Handler): void; post(path: string, handler: Handler): void };
  authorizeProject(headers: Headers, projectId: string): Promise<{ id: string }>;
  orchestrator: Pick<
    WorkspaceOrchestrator,
    "resolvePreviewLocation" | "markActivity" | "readPreviewStartup"
  >;
  secureCookie: boolean;
}) {
  registerPreviewSessionRoute({
    routes: input.routes,
    secureCookie: input.secureCookie,
    async authorize(headers, projectId) {
      const project = await input.authorizeProject(headers, projectId);
      const location = await input.orchestrator.resolvePreviewLocation(project.id);
      if (!location) throw new Error("workspace runtime is unavailable");
      // Session renewal is also workspace presence: an open Docs/Code tab must not be idled.
      input.orchestrator.markActivity(project.id);
      return { previewKey: location.previewKey };
    }
  });
  input.routes.get("/projects/:projectId/workspace/startup", async (request, response) => {
    try {
      const project = await input.authorizeProject(
        request.headers,
        String(request.params?.projectId ?? "")
      );
      response.setHeader?.("Cache-Control", "no-store");
      response.status(200).json(success(await input.orchestrator.readPreviewStartup(project.id)));
    } catch {
      response.status(403).json(failure("FORBIDDEN", "Workspace status is unavailable"));
    }
  });
}
