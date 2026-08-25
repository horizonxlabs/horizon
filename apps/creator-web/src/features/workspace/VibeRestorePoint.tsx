import { useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import { CreatorStatusMessage } from "@/shared";
import { restoreWorkspaceCommit } from "./api";

// Every committed turn is a restore point. Click ⏪ → inline confirm → the workspace code
// resets to that commit; the server logs the rollback into chat history so later turns
// know the app's real state.
export function VibeRestorePoint({
  projectId,
  commitSha,
  disabled,
  onRestored
}: {
  projectId: string;
  commitSha: string;
  disabled: boolean;
  onRestored: () => void;
}): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoreTechnicalDetails, setRestoreTechnicalDetails] = useState("");

  async function runRestore() {
    setBusy(true);
    setRestoreTechnicalDetails("");
    try {
      await restoreWorkspaceCommit(projectId, commitSha);
      setConfirming(false);
      onRestored();
    } catch (restoreError) {
      setRestoreTechnicalDetails(
        restoreError instanceof Error ? restoreError.message : "Unknown restore failure."
      );
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="vibe-restore-confirm" role="alertdialog" aria-label="Confirm restore">
        <span>Restore the code to this point? Later work will be removed.</span>
        <button type="button" disabled={busy} onClick={() => void runRestore()}>
          {busy ? "Restoring…" : "Confirm"}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        {restoreTechnicalDetails ? (
          <CreatorStatusMessage tone="danger" technicalDetails={restoreTechnicalDetails}>
            Restore failed. Try again.
          </CreatorStatusMessage>
        ) : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="vibe-restore-button"
      disabled={disabled}
      title="Restore code to this version"
      onClick={() => setConfirming(true)}
    >
      <Undo2 size={12} />
      Restore to this point
    </button>
  );
}
