import { type ProjectFileUploadDto } from "@evcp/api-client";
import { useEffect, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { extractedTextFor, sha256Hex } from "./project-file-upload";

export function useProjectFiles(selectedProjectId: string) {
  const [projectFiles, setProjectFiles] = useState<ProjectFileUploadDto[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [isUploadingProjectFile, setIsUploadingProjectFile] = useState(false);
  const [projectFileMessage, setProjectFileMessage] = useState("");

  useEffect(() => {
    if (!selectedProjectId) return;
    setSelectedAttachmentIds([]);
    try {
      createCreatorPlatformClient()
        .listProjectFiles(selectedProjectId)
        .then((files) => {
          setProjectFiles(files);
          setProjectFileMessage(files.length ? "Project files ready for AI context." : "");
        })
        .catch(() => {
          setProjectFiles([]);
          setProjectFileMessage("");
        });
    } catch {
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
    setIsUploadingProjectFile(true);
    setProjectFileMessage("Uploading project files...");
    try {
      const client = createCreatorPlatformClient();
      const completedFiles: ProjectFileUploadDto[] = [];
      for (const file of selectedFiles) {
        const initialized = await client.initializeProjectFileUpload(selectedProjectId, {
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
        const completed = await client.completeProjectFileUpload(
          selectedProjectId,
          initialized.uploadId,
          {
            scanStatus: "clean",
            extractedText: await extractedTextFor(file)
          }
        );
        completedFiles.push(completed.file);
      }
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
      setProjectFileMessage(error instanceof Error ? error.message : "Project file upload failed.");
    } finally {
      setIsUploadingProjectFile(false);
    }
  }

  return {
    projectFiles,
    setProjectFiles,
    selectedAttachmentIds,
    setSelectedAttachmentIds,
    isUploadingProjectFile,
    setIsUploadingProjectFile,
    projectFileMessage,
    setProjectFileMessage,
    toggleProjectFileAttachment,
    handleUploadProjectFiles
  };
}
