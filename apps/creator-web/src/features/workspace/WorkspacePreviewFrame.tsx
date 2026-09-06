import { useRef, useState } from "react";

export function WorkspacePreviewFrame({ previewKey, src }: { previewKey: number; src: string }) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const handleLoad = () => {
    setLoaded(true);
    try {
      frameRef.current?.contentWindow?.addEventListener("beforeunload", () => setLoaded(false), {
        once: true
      });
    } catch {
      // The preview normally stays same-origin; a generated redirect may make it opaque.
    }
  };

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
        ref={frameRef}
        title="Live preview"
        src={src}
        className="vibe-live-iframe"
        onLoad={handleLoad}
      />
    </div>
  );
}
