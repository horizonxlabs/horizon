import { useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
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
  const [error, setError] = useState("");

  async function runRestore() {
    setBusy(true);
    setError("");
    try {
      await restoreWorkspaceCommit(projectId, commitSha);
      setConfirming(false);
      onRestored();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="vibe-restore-confirm" role="alertdialog" aria-label="Confirm restore">
        <span>Restore code to this point? All later work will be removed.</span>
        <button type="button" disabled={busy} onClick={() => void runRestore()}>
          {busy ? "Restoring…" : "Restore"}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        {error && <span className="vibe-restore-error">{error}</span>}
      </span>
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
      Restore this version
    </button>
  );
}
