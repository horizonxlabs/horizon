import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@evcp/ui";
import { useState } from "react";
import { CreatorStatusMessage } from "@/shared";
import type { WorkspaceFailure } from "./workspace-failure";

export function WorkspaceRequestFailure({
  failure,
  onRetry
}: {
  failure?: WorkspaceFailure;
  onRetry: () => void | Promise<void>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  if (!failure) return null;
  return (
    <div className="vibe-workspace-recovery" role="alert">
      <div className="vibe-workspace-recovery-card">
        <AlertTriangle className="vibe-workspace-recovery-icon" size={17} aria-hidden="true" />
        <div className="vibe-workspace-recovery-copy">
          <strong>{failure.title}</strong>
          <span>{failure.description}</span>
        </div>
        <div className="vibe-workspace-recovery-actions">
          <Button
            className="vibe-workspace-retry"
            variant="secondary"
            type="button"
            disabled={!failure.retryPrompt || isRetrying}
            onClick={async () => {
              if (isRetrying) return;
              setIsRetrying(true);
              try {
                await onRetry();
              } finally {
                setIsRetrying(false);
              }
            }}
          >
            <RotateCw size={14} aria-hidden="true" />
            {isRetrying ? "Retrying…" : failure.retryLabel}
          </Button>
          <details className="vibe-workspace-recovery-details">
            <summary>Technical details</summary>
            <pre>{failure.technicalDetails}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export function ProjectFileStatus({
  message,
  technicalDetails
}: {
  message: string;
  technicalDetails?: string;
}) {
  if (technicalDetails) {
    return (
      <CreatorStatusMessage tone="danger" technicalDetails={technicalDetails}>
        {message}
      </CreatorStatusMessage>
    );
  }
  return message ? <span className="vibe-live-file-message">{message}</span> : null;
}
