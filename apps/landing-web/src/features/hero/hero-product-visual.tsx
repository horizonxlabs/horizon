const workspaceRows = [
  { label: "PRD baseline", value: "v4 · approved" },
  { label: "Workspace", value: "container running" },
  { label: "Preview", value: "checkpoint 12" },
  { label: "Publish policy", value: "approved" }
];

export function HeroProductVisual() {
  return (
    <div
      aria-hidden="true"
      className="evcp-glow-card bg-surface border-border-soft overflow-hidden border"
    >
      <div className="border-border-soft flex items-center gap-2 border-b px-5 py-4">
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="text-muted ml-3 text-sm">Horizon Creator</span>
      </div>
      <dl className="divide-border-soft divide-y">
        {workspaceRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-5 py-4">
            <dt className="text-muted text-sm">{row.label}</dt>
            <dd className="text-body text-sm font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
