import { failure, success } from "@evcp/api-client";

type HeaderBag = Record<string, string | string[] | undefined>;

type WorkspaceFilesRawApp = {
  all: (path: string, handler: (req: WorkspaceFilesReq, res: WorkspaceFilesRes) => void) => void;
};

type WorkspaceFilesReq = {
  params?: Record<string, string | undefined>;
  method?: string;
  headers?: HeaderBag;
};

type WorkspaceFilesRes = {
  status: (code: number) => { json: (body: unknown) => void };
};

type WorkspaceFilesAuth = {
  projectIds: string[];
};

type WorkspaceFilesGenerationService = {
  listWorkspaceFiles(projectId: string): Promise<Array<{ path: string; content: string }>>;
};

export function registerWorkspaceFilesRoute(input: {
  rawApp: WorkspaceFilesRawApp;
  generationService: WorkspaceFilesGenerationService;
  resolveAuth: (req: WorkspaceFilesReq) => Promise<WorkspaceFilesAuth>;
}): void {
  input.rawApp.all("/projects/:projectId/workspace/files", async (req, res) => {
    if (String(req.method ?? "GET").toUpperCase() !== "GET") {
      res.status(405).json(failure("METHOD_NOT_ALLOWED", "Workspace files supports GET only"));
      return;
    }
    const auth = await input.resolveAuth(req).catch(() => null);
    if (!auth) {
      res.status(401).json(failure("UNAUTHORIZED", "Authentication is required"));
      return;
    }
    const projectId = String(req.params?.projectId ?? "");
    if (!auth.projectIds.includes(projectId)) {
      res.status(403).json(failure("FORBIDDEN", "Project access is required"));
      return;
    }
    try {
      const files = await input.generationService.listWorkspaceFiles(projectId);
      res.status(200).json(success({ files }));
    } catch (error) {
      res
        .status(404)
        .json(failure("WORKSPACE_FILES_UNAVAILABLE", (error as Error).message));
    }
  });
}
