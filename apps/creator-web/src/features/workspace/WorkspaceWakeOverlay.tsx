export function WorkspaceWakeOverlay({ projectName }: { projectName: string }) {
  return (
    <div className="hz-loading-backdrop" role="status" aria-live="polite">
      <div className="hz-loading-card">
        <span className="hz-spinner" aria-hidden="true" />
        <strong>Preparing sandbox</strong>
        <span>
          Starting a secure container for {projectName}. Your workspace will be ready shortly.
        </span>
      </div>
    </div>
  );
}
