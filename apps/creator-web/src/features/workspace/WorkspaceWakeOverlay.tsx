import { PreviewStartupProgress } from "./PreviewStartupProgress";

export function WorkspaceWakeOverlay({ projectId }: { projectId: string }) {
  return (
    <div className="hz-loading-backdrop" role="status" aria-live="polite">
      <div className="hz-loading-card">
        <span className="hz-spinner" aria-hidden="true" />
        <PreviewStartupProgress projectId={projectId} />
      </div>
    </div>
  );
}
