import { Button } from "@evcp/ui";

export type WorkspaceView = "conversation" | "preview" | "code" | "database";

const MOBILE_VIEWS: WorkspaceView[] = ["conversation", "preview", "code", "database"];

// Small-screen panel switcher (extracted from WorkspacePage for the 400-line ratchet).
export function WorkspaceMobileNav({
  active,
  onSelect
}: {
  active: WorkspaceView | null;
  onSelect: (view: WorkspaceView) => void;
}) {
  return (
    <nav className="workspace-mobile-switcher" aria-label="Workspace panels">
      {MOBILE_VIEWS.map((view) => (
        <Button
          key={view}
          variant="ghost"
          type="button"
          aria-pressed={active === view}
          onClick={() => onSelect(view)}
        >
          {view[0].toUpperCase() + view.slice(1)}
        </Button>
      ))}
    </nav>
  );
}
