import { useState } from "react";
import { cn } from "../cn";
import { Markdown } from "./markdown";

// Two-mode content editor: a plain textarea for writing Markdown and a rendered preview ("view").
// Used to author knowledge/skill content in the admin console. Styling stays in the design system.

const surface =
  "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-body outline-none";

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
  id
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const minHeight = { minHeight: `${rows * 1.5}rem` };
  const tab = (target: "write" | "preview", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === target}
      onClick={() => setMode(target)}
      className={cn(
        "-mb-px rounded-none border-b-2 bg-transparent px-3 py-1.5 text-sm font-medium outline-none",
        mode === target ? "border-primary text-primary" : "border-transparent text-muted hover:text-body"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Markdown editor mode" className="flex gap-1 border-b border-border">
        {tab("write", "Write")}
        {tab("preview", "Preview")}
      </div>
      {mode === "write" ? (
        <textarea
          id={id}
          className={cn(surface, "resize-y font-mono placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft")}
          style={minHeight}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <div className={cn(surface, "overflow-auto")} style={minHeight}>
          {value.trim() ? <Markdown text={value} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
}
