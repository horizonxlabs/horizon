import { useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { canConfirmProjectDeletion } from "./deletion-state";

export function useProjectDeletion({
  projectId,
  projectName,
  onDeleted
}: {
  projectId: string;
  projectName: string;
  onDeleted: (projectId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errorTechnicalDetails, setErrorTechnicalDetails] = useState<string | undefined>();
  const canDelete = canConfirmProjectDeletion(confirmation, projectName);

  function close() {
    if (isDeleting) return;
    setIsOpen(false);
    setConfirmation("");
    setErrorMessage(undefined);
    setErrorTechnicalDetails(undefined);
  }

  async function deleteProject() {
    if (!canDelete || isDeleting) return;
    setIsDeleting(true);
    setErrorMessage(undefined);
    setErrorTechnicalDetails(undefined);
    try {
      await createCreatorPlatformClient().deleteProject(projectId);
      onDeleted(projectId);
    } catch (error) {
      setErrorMessage("Unable to delete this project. Your project remains unchanged.");
      setErrorTechnicalDetails(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }

  return {
    isOpen,
    open: () => setIsOpen(true),
    close,
    confirmation,
    setConfirmation,
    canDelete,
    isDeleting,
    errorMessage,
    errorTechnicalDetails,
    deleteProject
  };
}
