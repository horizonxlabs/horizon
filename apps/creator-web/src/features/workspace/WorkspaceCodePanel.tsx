import { getWorkspaceFiles, type WorkspaceFileDto } from "@evcp/api-client";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  FolderTree,
  RefreshCw,
  Search
} from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Button } from "@evcp/ui";
import { useEffect, useMemo, useState } from "react";
import { CreatorState } from "@/shared";
import { ensureVibeWorkspace } from "./api";
import { createCreatorPlatformClient } from "@/shared/creator-client";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// Grammars bundled with prism-react-renderer's vendored Prism.
function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "tsx",
    tsx: "tsx",
    js: "jsx",
    jsx: "jsx",
    mjs: "jsx",
    cjs: "jsx",
    json: "json",
    css: "css",
    scss: "scss",
    html: "markup",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    py: "python"
  };
  return map[ext] ?? "clike";
}

function buildTree(files: WorkspaceFileDto[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let node = level.find((candidate) => candidate.name === part && candidate.isDir === !isLeaf);
      if (!node) {
        node = { name: part, path, isDir: !isLeaf, children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);
  return root;
}

function TreeRows({
  nodes,
  depth,
  activePath,
  collapsed,
  onToggle,
  onSelect
}: {
  nodes: TreeNode[];
  depth: number;
  activePath: string | undefined;
  collapsed: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const pad = { paddingLeft: `${8 + depth * 14}px` };
        if (node.isDir) {
          const open = !collapsed.has(node.path);
          return (
            <div key={node.path}>
              <button
                type="button"
                className="hz-tree-row hz-tree-dir"
                style={pad}
                onClick={() => onToggle(node.path)}
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {open ? <FolderOpen size={15} /> : <Folder size={15} />}
                <span>{node.name}</span>
              </button>
              {open ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  activePath={activePath}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ) : null}
            </div>
          );
        }
        return (
          <button
            type="button"
            key={node.path}
            className={`hz-tree-row hz-tree-file ${node.path === activePath ? "is-active" : ""}`.trim()}
            style={pad}
            onClick={() => onSelect(node.path)}
          >
            <FileCode2 size={14} />
            <span>{node.name}</span>
          </button>
        );
      })}
    </>
  );
}

export function WorkspaceCodePanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<WorkspaceFileDto[]>([]);
  const [activePath, setActivePath] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [errorTechnicalDetails, setErrorTechnicalDetails] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorTechnicalDetails(undefined);
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
        setErrorTechnicalDetails(
          `${detail?.status ?? "?"} · ${detail?.message ?? "Unknown workspace file failure."}`
        );
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
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);
  const activeFile = filteredFiles.find((file) => file.path === activePath) ?? filteredFiles[0];
  const lineCount = activeFile ? activeFile.content.split("\n").length : 0;

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (errorTechnicalDetails) {
    return (
      <CreatorState
        kind="unavailable"
        title="Workspace files unavailable"
        description="We couldn't load the source files. Try again."
        technicalDetails={errorTechnicalDetails}
        action={
          <Button
            variant="secondary"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Retry
          </Button>
        }
      />
    );
  }
  if (isLoading && files.length === 0) {
    return <div className="hz-code-empty">Loading files in workspace…</div>;
  }
  if (files.length === 0) {
    return (
      <div className="hz-code-empty">
        <FolderTree size={28} aria-hidden="true" />
        <strong>No files in this workspace yet</strong>
        <span>Ask the AI to build in chat, then come back to view the source here.</span>
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
              placeholder="Search files…"
              aria-label="Search files in workspace"
            />
          </div>
          <Button
            variant="ghost"
            type="button"
            title="Reload"
            aria-label="Reload files"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </Button>
        </div>
        <div className="hz-code-count">
          <FolderTree size={14} aria-hidden="true" />
          <span>{files.length} Files in workspace</span>
        </div>
        <div className="hz-code-tree" role="tree">
          {filteredFiles.length === 0 ? (
            <div className="hz-code-no-results">No files match your search</div>
          ) : (
            <TreeRows
              nodes={tree}
              depth={0}
              activePath={activeFile?.path}
              collapsed={collapsed}
              onToggle={toggle}
              onSelect={setActivePath}
            />
          )}
        </div>
      </aside>
      <section className="hz-code-viewer" aria-label="Code viewer">
        <div className="hz-code-viewer-head">
          <span>{activeFile ? fileName(activeFile.path) : "No file selected"}</span>
          {activeFile ? (
            <small>
              {activeFile.path} · {lineCount} lines · {formatBytes(activeFile.content)}
            </small>
          ) : null}
        </div>
        {activeFile ? (
          <Highlight
            code={activeFile.content}
            language={languageFor(activeFile.path)}
            theme={themes.vsLight}
          >
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre className="hz-code-pre" style={style}>
                {tokens.map((line, lineIndex) => (
                  <div key={lineIndex} {...getLineProps({ line })} className="hz-code-line">
                    <span className="hz-code-lineno">{lineIndex + 1}</span>
                    <span className="hz-code-linebody">
                      {line.map((token, tokenIndex) => (
                        <span key={tokenIndex} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        ) : (
          <pre className="hz-code-pre" />
        )}
      </section>
    </div>
  );
}
