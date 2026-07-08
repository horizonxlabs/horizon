import { Send } from "lucide-react";
import { VibeActionRow } from "../components/VibeActionRow";
import { platformSessionToken } from "../lib/session";
import type { useCreatorApp } from "../hooks/use-creator-app";

export function WorkspacePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    isVibing,
    vibeStatus,
    vibeTab,
    setVibeTab,
    setVibePreviewKey,
    vibeMessages,
    promptDraft,
    setPromptDraft,
    handleVibeChat,
    vibePreviewKey
  } = app;
  // Preview is addressed by the id-derived resource key (matches the container name), not the
  // public slug, so it survives a rename. Project ids never contain hyphens.
  const previewKey = selectedProject.id.replaceAll("_", "-");
  const previewSrc = `/preview/${previewKey}?token=${encodeURIComponent(platformSessionToken() ?? "")}`;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        color: "#1f2937",
        fontFamily: "inherit"
      }}
    >
      <header
        style={{
          height: 52,
          flexShrink: 0,
          borderBottom: "1px solid #ececed",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 16px"
        }}
      >
        <a
          href="/creator/projects"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            color: "#6b7280",
            fontSize: 13,
            fontWeight: 500
          }}
        >
          ‹ Projects
        </a>
        <div style={{ width: 1, height: 20, background: "#ececed" }} />
        <strong style={{ fontSize: 14, color: "#111827" }}>{selectedProject.name}</strong>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: isVibing ? "#f59e0b" : "#22c55e"
          }}
        />
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{vibeStatus || "ready"}</span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 2,
            background: "#f3f4f6",
            borderRadius: 10,
            padding: 3
          }}
        >
          {(["preview", "code"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setVibeTab(tab)}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "5px 16px",
                borderRadius: 8,
                border: 0,
                cursor: "pointer",
                background: vibeTab === tab ? "#fff" : "transparent",
                color: vibeTab === tab ? "#111827" : "#6b7280",
                boxShadow: vibeTab === tab ? "0 1px 2px rgba(0,0,0,0.06)" : "none"
              }}
            >
              {tab === "preview" ? "Preview" : "Code"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVibePreviewKey((key) => key + 1)}
          title="Refresh preview"
          style={{
            fontSize: 13,
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 8,
            padding: "5px 11px",
            cursor: "pointer",
            color: "#374151"
          }}
        >
          ↻
        </button>
        <a
          href={previewSrc}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 13,
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 8,
            padding: "5px 11px",
            cursor: "pointer",
            color: "#374151",
            textDecoration: "none"
          }}
        >
          Open ↗
        </a>
        <button
          type="button"
          title="Publish to production (Plan 5 pipeline)"
          style={{
            fontSize: 13,
            border: "1px solid #2563eb",
            background: "#2563eb",
            borderRadius: 8,
            padding: "5px 14px",
            cursor: "pointer",
            color: "#fff",
            fontWeight: 600
          }}
        >
          Publish
        </button>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(340px, 34%) 1fr"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderRight: "1px solid #ececed"
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 0
            }}
          >
            {vibeMessages.length === 0 && !isVibing && (
              <div
                style={{
                  margin: "auto",
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 13,
                  maxWidth: 300
                }}
              >
                <div style={{ fontSize: 34, marginBottom: 10 }}>✨</div>
                <div style={{ fontWeight: 600, color: "#4b5563", marginBottom: 4, fontSize: 15 }}>
                  Build with AI
                </div>
                Describe what you want. The AI writes code into your live app, runs it, and commits
                each change.
              </div>
            )}
            {vibeMessages.map((message) =>
              message.role === "user" ? (
                <div
                  key={message.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "88%",
                    background: "#f4f1fe",
                    color: "#4c1d95",
                    padding: "9px 13px",
                    borderRadius: "14px 14px 4px 14px",
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {message.text}
                </div>
              ) : (
                <div
                  key={message.id}
                  style={{
                    alignSelf: "flex-start",
                    maxWidth: "96%",
                    color: "#1f2937",
                    fontSize: 14,
                    lineHeight: 1.6
                  }}
                >
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {message.text || (isVibing ? "▋" : "")}
                  </div>
                  {message.actions.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {message.actions.map((action) => (
                        <VibeActionRow key={action.id} action={action} />
                      ))}
                    </div>
                  )}
                  {message.commitSha && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "#7c3aed",
                        fontFamily: "ui-monospace, monospace"
                      }}
                    >
                      ⑂ committed {message.commitSha.slice(0, 8)}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 18px 8px" }}>
            {["Add an about page", "Make it dark mode", "Add a contact form"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setPromptDraft(suggestion)}
                style={{
                  fontSize: 12,
                  color: "#374151",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 999,
                  padding: "4px 12px",
                  cursor: "pointer"
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div style={{ padding: "0 18px 18px" }}>
            <div
              style={{
                border: "1px solid #e0e0e6",
                borderRadius: 14,
                padding: 8,
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
              }}
            >
              <textarea
                aria-label="Ask AI to build"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!isVibing && promptDraft.trim()) void handleVibeChat();
                  }
                }}
                placeholder="Ask AI to build…"
                rows={1}
                style={{
                  flex: 1,
                  resize: "none",
                  border: 0,
                  outline: "none",
                  fontSize: 14,
                  lineHeight: 1.5,
                  background: "transparent",
                  color: "#1f2937",
                  maxHeight: 140,
                  fontFamily: "inherit"
                }}
              />
              <button
                type="button"
                onClick={handleVibeChat}
                disabled={isVibing || !promptDraft.trim()}
                aria-label="Send prompt"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: 0,
                  background: isVibing || !promptDraft.trim() ? "#d1d5db" : "#111827",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isVibing || !promptDraft.trim() ? "default" : "pointer",
                  flexShrink: 0
                }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
        <div
          style={{
            minHeight: 0,
            background: "#fafafa",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {vibeTab === "preview" ? (
            <iframe
              key={vibePreviewKey}
              title="Live preview"
              src={previewSrc}
              style={{ flex: 1, border: 0, width: "100%", background: "#fff", minHeight: 0 }}
            />
          ) : (
            <div
              style={{ flex: 1, overflowY: "auto", padding: 24, fontSize: 13, color: "#374151" }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Changes this session</div>
              {vibeMessages.flatMap((message) => message.actions).length === 0 ? (
                <div style={{ color: "#9ca3af" }}>
                  No changes yet. Ask the AI to build something.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {vibeMessages
                    .flatMap((message) => message.actions)
                    .map((action, index) => (
                      <VibeActionRow key={`${action.id}-${index}`} action={action} />
                    ))}
                </div>
              )}
              <div style={{ marginTop: 20, color: "#9ca3af", fontSize: 12 }}>
                A full file browser is on the roadmap — use the Preview tab to see the running app.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
