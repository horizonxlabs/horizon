import { useState, type ReactNode } from "react";
import { vibeActionIcon, vibeActionVerb, type VibeAction } from "../lib/vibe-actions";

export function VibeActionRow({ action }: { action: VibeAction }): ReactNode {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(action.find || action.replace || action.body || action.error);
  const running = action.status === "running";
  const failed = action.status === "failed";
  const accent = running ? "#6b7280" : failed ? "#dc2626" : "#059669";
  const bg = running ? "#f9fafb" : failed ? "#fef2f2" : "#f0fdf4";
  const border = running ? "#e5e7eb" : failed ? "#fecaca" : "#bbf7d0";
  const isDiff = action.find !== undefined || action.replace !== undefined;
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12
      }}
    >
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          padding: "5px 9px",
          cursor: hasBody ? "pointer" : "default",
          color: accent,
          textAlign: "left"
        }}
      >
        <span aria-hidden>{vibeActionIcon(action.type)}</span>
        <span className={running ? "vibe-shimmer" : ""} style={{ fontWeight: 600 }}>
          {running ? "" : failed ? "✗ " : "✓ "}
          {vibeActionVerb(action.type, action.status)}
        </span>
        <span
          style={{
            color: "#374151",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1
          }}
        >
          {action.label}
        </span>
        {hasBody && <span style={{ color: "#9ca3af" }}>{open ? "▾" : "▸"}</span>}
      </button>
      {open && hasBody && (
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            background: "#0b1021",
            color: "#e5e7eb",
            padding: 10,
            maxHeight: 320,
            overflow: "auto"
          }}
        >
          {action.error ? (
            <pre style={{ margin: 0, color: "#fca5a5", whiteSpace: "pre-wrap" }}>
              {action.error}
            </pre>
          ) : isDiff ? (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {(action.find ?? "").split("\n").map((line, i) => (
                <div key={`f${i}`} style={{ color: "#fca5a5" }}>
                  - {line}
                </div>
              ))}
              {(action.replace ?? "").split("\n").map((line, i) => (
                <div key={`r${i}`} style={{ color: "#86efac" }}>
                  + {line}
                </div>
              ))}
            </pre>
          ) : (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{action.body}</pre>
          )}
        </div>
      )}
    </div>
  );
}
