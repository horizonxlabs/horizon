// Placeholder while the enterprise Database tab is built on a per-project scoped-role
// introspection backend (react-data-grid + read/write). Replaces the earlier seed-backed view.
export function WorkspaceDatabasePanel({ projectId }: { projectId: string }) {
  return (
    <div className="hz-db-empty">
      Database — กำลังพัฒนา (real introspection ต่อ schema ของ project {projectId})
    </div>
  );
}
