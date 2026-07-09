import { getWorkspaceFiles, type WorkspaceFileDto } from "@evcp/api-client";
import { FileCode2, FolderTree, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ensureVibeWorkspace } from "../hooks/creator-app-helpers";
import { createCreatorPlatformClient } from "../lib/creator-client";

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function fileFolder(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
}

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function WorkspaceCodePanel({
  projectId
}: {
  projectId: string;
}) {
  const [files, setFiles] = useState<WorkspaceFileDto[]>([]);
  const [activePath, setActivePath] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [errorText, setErrorText] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorText(undefined);
    ensureVibeWorkspace(projectId)
      .then(() => getWorkspaceFiles(createCreatorPlatformClient(), projectId))
      .then((snapshot) => {
        if (cancelled) return;
        const ordered = [...snapshot.files].sort((a, b) => a.path.localeCompare(b.path));
        setFiles(ordered);
        setActivePath((current) =>
          ordered.some((file) => file.path === current) ? current : ordered[0]?.path
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error as { status?: number; message?: string };
        setErrorText(`${detail?.status ?? "?"} · ${detail?.message ?? "network error"}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFiles = useMemo(
    () =>
      normalizedQuery
        ? files.filter((file) => file.path.toLowerCase().includes(normalizedQuery))
        : files,
    [files, normalizedQuery]
  );
  const activeFile = filteredFiles.find((file) => file.path === activePath) ?? filteredFiles[0];
  const lineCount = activeFile ? activeFile.content.split("\n").length : 0;

  if (errorText) {
    return (
      <div className="hz-code-empty">
        <FileCode2 size={28} aria-hidden="true" />
        <strong>โหลดไฟล์ใน workspace ไม่สำเร็จ</strong>
        <span>{errorText}</span>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
          ลองใหม่
        </button>
      </div>
    );
  }

  if (isLoading && files.length === 0) {
    return <div className="hz-code-empty">กำลังโหลด Files in workspace…</div>;
  }

  if (files.length === 0) {
    return (
      <div className="hz-code-empty">
        <FolderTree size={28} aria-hidden="true" />
        <strong>ยังไม่มีไฟล์ใน workspace</strong>
        <span>เริ่มจากการสั่ง AI build ในแชต แล้วกลับมาดู source code ที่นี่</span>
      </div>
    );
  }

  return (
    <div className="hz-code">
      <aside className="hz-code-sidebar" aria-label="Files in workspace">
        <div className="hz-code-toolbar">
          <div className="hz-code-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาไฟล์…"
              aria-label="ค้นหาไฟล์ใน workspace"
            />
          </div>
          <button
            type="button"
            className="hz-code-icon-btn"
            title="โหลดใหม่"
            aria-label="โหลดไฟล์ใหม่"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="hz-code-count">
          <FolderTree size={14} aria-hidden="true" />
          <span>{files.length} Files in workspace</span>
        </div>
        <div className="hz-code-file-list">
          {filteredFiles.length === 0 ? (
            <div className="hz-code-no-results">ไม่พบไฟล์ที่ตรงกับคำค้น</div>
          ) : (
            filteredFiles.map((file) => (
              <button
                type="button"
                key={file.path}
                className={`hz-code-file-item ${file.path === activeFile?.path ? "is-active" : ""}`.trim()}
                onClick={() => setActivePath(file.path)}
              >
                <FileCode2 size={14} aria-hidden="true" />
                <span>
                  <strong>{fileName(file.path)}</strong>
                  <em>{fileFolder(file.path)}</em>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="hz-code-viewer" aria-label="Code viewer">
        <div className="hz-code-viewer-head">
          <span>{activeFile?.path ?? "ไม่มีไฟล์ที่เลือก"}</span>
          {activeFile ? (
            <small>
              {lineCount} lines · {formatBytes(activeFile.content)}
            </small>
          ) : null}
        </div>
        <pre className="hz-code-pre">
          <code>{activeFile?.content ?? ""}</code>
        </pre>
      </section>
    </div>
  );
}
