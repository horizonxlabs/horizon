import { useState } from "react";

export function WorkspacePreviewFrame({ previewKey, src }: { previewKey: number; src: string }) {
  const [loaded, setLoaded] = useState(false);
  // Show setup progress only for this frame's initial load. Next.js owns subsequent
  // hot updates and navigation; the parent remounts only for an explicit refresh.

  return (
    <div className="vibe-live-preview-frame" aria-busy={!loaded || undefined}>
      {!loaded ? (
        <div
          className="vibe-live-preview-loading"
          role="status"
          aria-live="polite"
          data-preview-loading
        >
          <div className="hz-loading-card">
            <span className="hz-spinner" aria-hidden="true" />
            <strong>Preparing app preview</strong>
            <span>Starting the secure sandbox. The preview will appear automatically.</span>
          </div>
        </div>
      ) : null}
      <iframe
        key={previewKey}
        title="Live preview"
        src={src}
        className="vibe-live-iframe"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
