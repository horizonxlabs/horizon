import type { GoldenTemplate } from "../workspace-orchestrator/template";

export type RunnableAction =
  | { id: string; type: "file"; filePath: string; content: string }
  | { id: string; type: "edit"; filePath: string; find: string; replace: string }
  | { id: string; type: "shell"; command: string }
  | { id: string; type: "migration"; name: string; sql: string };

export type ActionResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; stdout: string; stderr: string; exitCode: number };

export interface ActionRunner {
  runAction(input: {
    containerId: string;
    projectId: string;
    template: GoldenTemplate;
    action: RunnableAction;
    commitSha?: string;
    onShellOutput?: (chunk: string) => void;
  }): Promise<ActionResult>;
  runMigrationBatch(input: {
    containerId: string;
    projectId: string;
    actions: Array<Extract<RunnableAction, { type: "migration" }>>;
    commitSha: string;
  }): Promise<ActionResult>;
  syncMigrationArtifacts?(input: {
    containerId: string;
    projectId: string;
    actions: Array<Extract<RunnableAction, { type: "migration" }>>;
  }): Promise<ActionResult>;
}
