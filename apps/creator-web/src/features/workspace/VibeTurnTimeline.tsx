import type { WorkspaceChatTurnPart, WorkspaceChatToolPart } from "@evcp/types";
import { GitCommitHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { VibeActionSummary } from "./VibeActionSummary";
import { VibeMarkdown } from "./VibeMarkdown";
import { VibeReasoning } from "./VibeReasoning";
import type { VibeAction } from "./vibe-actions";
import { stripSuggestions } from "./vibe-suggest";
import { stripQuestions } from "./vibe-questions";
import { stripWorkspaceFailureText } from "./workspace-failure";

type Props = {
  parts?: WorkspaceChatTurnPart[];
  legacy: { text: string; reasoning?: string; actions: VibeAction[]; commitSha?: string };
  live: boolean;
  imageBase?: string;
  hideFailureDetails?: boolean;
};

type NonToolTurnPart = Exclude<WorkspaceChatTurnPart, { type: "tool" }>;
type TimelineSegment =
  | { id: string; type: "activity"; tools: WorkspaceChatToolPart[] }
  | { id: string; type: "part"; part: NonToolTurnPart; sourceIndex: number };

function toAction(id: string, tool: WorkspaceChatToolPart): VibeAction {
  return {
    id,
    type: tool.actionType,
    label: tool.label,
    status: tool.status === "pending" || tool.status === "running" ? "running" : tool.status,
    body: tool.progress ?? ("result" in tool ? tool.result : undefined),
    find: "find" in tool ? tool.find : undefined,
    replace: "replace" in tool ? tool.replace : undefined,
    error: tool.status === "failed" ? tool.error : undefined
  };
}

// Older messages predate `parts`. Keep them readable, while all new / restored turns use the
// persisted event order below instead of rendering response text and tools in separate groups.
function legacyParts(legacy: Props["legacy"]): WorkspaceChatTurnPart[] {
  const parts: WorkspaceChatTurnPart[] = [];
  if (legacy.reasoning)
    parts.push({
      id: "legacy-reasoning",
      type: "reasoning",
      sequence: parts.length,
      text: legacy.reasoning
    });
  if (legacy.text)
    parts.push({ id: "legacy-text", type: "text", sequence: parts.length, text: legacy.text });
  for (const action of legacy.actions) {
    parts.push({
      id: `legacy-tool-${action.id}`,
      type: "tool",
      sequence: parts.length,
      tool: {
        callId: action.id,
        actionType: action.type as WorkspaceChatToolPart["actionType"],
        label: action.label,
        inputSummary: "Legacy action",
        startedAt: "",
        endedAt: "",
        status: action.status === "running" ? "running" : action.status,
        result: action.body,
        error: action.status === "failed" ? (action.error ?? "Tool failed") : undefined
      } as unknown as WorkspaceChatToolPart
    });
  }
  if (legacy.commitSha)
    parts.push({
      id: "legacy-commit",
      type: "commit",
      sequence: parts.length,
      sha: legacy.commitSha
    });
  return parts;
}

// Keep commentary in its original stream position. Only adjacent tool calls belong to the
// same Activity card; a new assistant update starts a new, independently expandable phase.
function segmentParts(parts: WorkspaceChatTurnPart[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  for (const [sourceIndex, part] of parts.entries()) {
    const previous = segments.at(-1);
    if (part.type === "tool" && previous?.type === "activity") {
      previous.tools.push(part.tool);
      continue;
    }
    if (part.type === "tool") {
      segments.push({ id: `activity-${part.id}`, type: "activity", tools: [part.tool] });
      continue;
    }
    segments.push({ id: part.id, type: "part", part, sourceIndex });
  }
  return segments;
}

export function VibeTurnTimeline({
  parts: persistedParts,
  legacy,
  live,
  imageBase,
  hideFailureDetails = false
}: Props): ReactNode {
  const parts = (persistedParts?.length ? persistedParts : legacyParts(legacy))
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  const segments = segmentParts(parts);
  return (
    <div className="vibe-turn-timeline" aria-label="Agent activity">
      {segments.map((segment) => {
        if (segment.type === "activity") {
          return (
            <VibeActionSummary
              key={segment.id}
              actions={segment.tools.map((tool) => toAction(tool.callId, tool))}
            />
          );
        }
        const { part, sourceIndex } = segment;
        if (part.type === "reasoning") {
          return (
            <VibeReasoning
              key={part.id}
              reasoning={part.text}
              live={live && sourceIndex === parts.length - 1}
            />
          );
        }
        if (part.type === "text") {
          const text = hideFailureDetails ? stripWorkspaceFailureText(part.text) : part.text;
          if (!text) return null;
          return (
            <div key={part.id} className="vibe-message-text">
              <VibeMarkdown text={stripQuestions(stripSuggestions(text))} imageBase={imageBase} />
              {live && sourceIndex === parts.length - 1 && (
                <span className="vibe-cursor-blink" aria-hidden="true">
                  ▋
                </span>
              )}
            </div>
          );
        }
        if (part.type === "commit") {
          return (
            <div
              key={part.id}
              className="vibe-commit-status"
              title={`Commit ${part.sha.slice(0, 8)}`}
            >
              <GitCommitHorizontal size={14} aria-hidden="true" />
              <span>Saved to project history</span>
            </div>
          );
        }
        if (hideFailureDetails) return null;
        return (
          <div key={part.id} className="vibe-turn-error" role="alert">
            ⚠️ {part.message}
          </div>
        );
      })}
      {live && parts.length === 0 && (
        <span className="vibe-cursor-blink" aria-label="Pi is working">
          ▋
        </span>
      )}
    </div>
  );
}
