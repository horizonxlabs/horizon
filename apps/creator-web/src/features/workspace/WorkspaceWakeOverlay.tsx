export function WorkspaceWakeOverlay({ projectName }: { projectName: string }) {
  return (
    <div className="hz-loading-backdrop" role="status" aria-live="polite">
      <div className="hz-loading-card">
        <span className="hz-spinner" aria-hidden="true" />
        <strong>Waking up your workspace</strong>
        <span>
          Starting a secure container for {projectName}. Your files and conversation will appear
          when it is ready.
        </span>
      </div>
    </div>
  );
}
