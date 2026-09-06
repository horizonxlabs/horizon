import { ArrowUpRight, ChevronLeft, RotateCw } from "lucide-react";
import { Button, Tabs } from "@evcp/ui";
import { TAB_LABELS, WORKSPACE_TABS, type WorkspaceTab } from "./workspace-chrome";

export function WorkspaceHeader({
  projectName,
  status,
  isVibing,
  liveLines,
  failed,
  activeTab,
  previewSrc,
  isPreviewAuthorized,
  onSelectTab,
  onRefreshPreview,
  onPublish
}: {
  projectName: string;
  status: string;
  isVibing: boolean;
  liveLines: number;
  failed: boolean;
  activeTab: WorkspaceTab;
  previewSrc: string;
  isPreviewAuthorized: boolean;
  onSelectTab: (tab: WorkspaceTab) => void;
  onRefreshPreview: () => void;
  onPublish: () => void;
}) {
  return (
    <header className="vibe-live-header">
      <div className="vibe-live-header-left">
        <a className="vibe-live-back-link" href="/creator/">
          <ChevronLeft size={16} aria-hidden="true" />
          <span>Projects</span>
        </a>
        <div className="vibe-live-divider" />
        <strong className="vibe-live-project-name">{projectName}</strong>
        <span
          className={`vibe-live-status ${isVibing ? "is-running" : failed ? "is-failed" : "is-ready"}`}
          role="status"
        >
          <span className="vibe-live-status-dot" aria-hidden="true" />
          {status || "Completed"}
          {isVibing && liveLines > 0 ? ` · ${liveLines} lines` : ""}
        </span>
      </div>
      <div className="vibe-live-header-right">
        <div className="workspace-desktop-tabs">
          <Tabs
            items={WORKSPACE_TABS.map((tab) => ({ id: tab, label: TAB_LABELS[tab] }))}
            active={activeTab}
            onSelect={onSelectTab}
            variant="segmented"
            aria-label="Workspace view"
          />
        </div>
        <div className="vibe-live-divider" />
        <Button
          variant="ghost"
          type="button"
          onClick={onRefreshPreview}
          title="Refresh preview"
          aria-label="Refresh preview"
        >
          <RotateCw size={15} aria-hidden="true" />
        </Button>
        <a
          href={previewSrc}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!isPreviewAuthorized}
          onClick={(event) => {
            if (!isPreviewAuthorized) event.preventDefault();
          }}
          className="vibe-live-control"
        >
          <span>Preview</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <Button
          variant="primary"
          type="button"
          title="Publish to staging or production"
          onClick={onPublish}
        >
          Publish
        </Button>
      </div>
    </header>
  );
}
