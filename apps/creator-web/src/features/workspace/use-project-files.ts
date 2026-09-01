import { type ProjectFileUploadDto } from "@evcp/api-client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { extractedTextFor, sha256Hex } from "./project-file-upload";

export function useProjectFiles(selectedProjectId: string) {
  const [storedProjectFiles, setStoredProjectFiles] = useState<ProjectFileUploadDto[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [isUploadingProjectFile, setIsUploadingProjectFile] = useState(false);
  const [projectFileMessage, setProjectFileMessage] = useState("");
  const [projectFileTechnicalDetails, setProjectFileTechnicalDetails] = useState<
    string | undefined
  >(undefined);
  const projectGenerationRef = useRef({ projectId: selectedProjectId, generation: 0 });
  const projectFilesProjectIdRef = useRef(selectedProjectId);
  if (projectGenerationRef.current.projectId !== selectedProjectId) {
    projectGenerationRef.current = {
      projectId: selectedProjectId,
      generation: projectGenerationRef.current.generation + 1
    };
  }
  const projectFiles =
    projectFilesProjectIdRef.current === selectedProjectId ? storedProjectFiles : [];

  const setProjectFiles: Dispatch<SetStateAction<ProjectFileUploadDto[]>> = (value) => {
    projectFilesProjectIdRef.current = projectGenerationRef.current.projectId;
    setStoredProjectFiles(value);
  };

  function isCurrentProject(projectId: string, generation: number) {
    return (
      projectGenerationRef.current.projectId === projectId &&
      projectGenerationRef.current.generation === generation
    );
  }

  useEffect(() => {
    const generation = projectGenerationRef.current.generation;
    projectFilesProjectIdRef.current = selectedProjectId;
    setProjectFiles([]);
    setSelectedAttachmentIds([]);
    setIsUploadingProjectFile(false);
    setProjectFileMessage("");
    setProjectFileTechnicalDetails(undefined);
    if (!selectedProjectId) return;
    try {
      createCreatorPlatformClient()
        .listProjectFiles(selectedProjectId)
        .then((files) => {
          if (!isCurrentProject(selectedProjectId, generation)) return;
          setProjectFiles(files);
          setProjectFileMessage(files.length ? "Project files ready for AI context." : "");
        })
        .catch(() => {
          if (!isCurrentProject(selectedProjectId, generation)) return;
          setProjectFiles([]);
          setProjectFileMessage("");
        });
    } catch {
      if (!isCurrentProject(selectedProjectId, generation)) return;
      setProjectFiles([]);
      setProjectFileMessage("");
    }
  }, [selectedProjectId]);

  function toggleProjectFileAttachment(uploadId: string) {
    setSelectedAttachmentIds((current) =>
      current.includes(uploadId) ? current.filter((id) => id !== uploadId) : [...current, uploadId]
    );
  }

  async function handleUploadProjectFiles(files: FileList | File[]) {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    const projectId = selectedProjectId;
    const generation = projectGenerationRef.current.generation;
    const isCurrent = () => isCurrentProject(projectId, generation);
    setIsUploadingProjectFile(true);
    setProjectFileMessage("Uploading project files...");
    setProjectFileTechnicalDetails(undefined);
    try {
      const client = createCreatorPlatformClient();
      const completedFiles: ProjectFileUploadDto[] = [];
      for (const file of selectedFiles) {
        const initialized = await client.initializeProjectFileUpload(projectId, {
          fileName: file.name,
          mimeType: file.type || "text/plain",
          sizeBytes: file.size,
          sha256: await sha256Hex(file),
          includeByDefault: true
        });
        if (/^https?:\/\//.test(initialized.uploadUrl)) {
          const uploadResponse = await fetch(initialized.uploadUrl, {
            method: "PUT",
            headers: { "content-type": file.type || "application/octet-stream" },
            body: file
          });
          if (!uploadResponse.ok) throw new Error(`File upload failed (${uploadResponse.status})`);
        }
        const completed = await client.completeProjectFileUpload(projectId, initialized.uploadId, {
          scanStatus: "clean",
          extractedText: await extractedTextFor(file)
        });
        completedFiles.push(completed.file);
      }
      if (!isCurrent()) return;
      setProjectFiles((current) => {
        const byId = new Map(current.map((file) => [file.id, file]));
        for (const file of completedFiles) byId.set(file.id, file);
        return [...byId.values()];
      });
      setSelectedAttachmentIds((current) => [
        ...new Set([...current, ...completedFiles.map((file) => file.id)])
      ]);
      setProjectFileMessage("Project files ready for AI context.");
    } catch (error) {
      if (!isCurrent()) return;
      setProjectFileMessage("Project file upload failed. Try again.");
      setProjectFileTechnicalDetails(
        error instanceof Error ? error.message : "Unknown project file upload failure."
      );
    } finally {
      if (isCurrent()) setIsUploadingProjectFile(false);
    }
  }

  return {
    projectFiles,
    setProjectFiles,
    selectedAttachmentIds:
      projectFilesProjectIdRef.current === selectedProjectId ? selectedAttachmentIds : [],
    setSelectedAttachmentIds,
    isUploadingProjectFile:
      projectFilesProjectIdRef.current === selectedProjectId ? isUploadingProjectFile : false,
    setIsUploadingProjectFile,
    projectFileMessage:
      projectFilesProjectIdRef.current === selectedProjectId ? projectFileMessage : "",
    setProjectFileMessage,
    projectFileTechnicalDetails:
      projectFilesProjectIdRef.current === selectedProjectId
        ? projectFileTechnicalDetails
        : undefined,
    setProjectFileTechnicalDetails,
    toggleProjectFileAttachment,
    handleUploadProjectFiles
  };
}
