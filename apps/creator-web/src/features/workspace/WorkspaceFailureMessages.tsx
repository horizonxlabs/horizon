import { Button } from "@evcp/ui";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import type { WorkspaceFailure } from "./workspace-failure";

export function WorkspaceRequestFailure({
  failure,
  onRetry
}: {
  failure?: WorkspaceFailure;
  onRetry: () => void;
}) {
  if (!failure) return null;
  return (
    <div className="vibe-workspace-recovery">
      <CreatorState
        kind="error"
        title={failure.title}
        description={failure.description}
        action={
          <Button
            variant="secondary"
            type="button"
            disabled={!failure.retryPrompt}
            onClick={onRetry}
          >
            {failure.retryLabel}
          </Button>
        }
        technicalDetails={failure.technicalDetails}
      />
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
