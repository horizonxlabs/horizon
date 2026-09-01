import { CreatorStatusMessage } from "@/shared";

export function WorkspaceRequestFailure({
  technicalDetails
}: {
  technicalDetails?: string;
}) {
  if (!technicalDetails) return null;
  return (
    <CreatorStatusMessage tone="danger" technicalDetails={technicalDetails}>
      We couldn't complete the workspace request. Try again.
    </CreatorStatusMessage>
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
