import type { WorkspaceChatTurnPart, WorkspaceChatToolPart } from "@evcp/types";
import type { ReactNode } from "react";
import { VibeActionRow } from "./VibeActionRow";
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

function toAction(id: string, tool: WorkspaceChatToolPart): VibeAction {
  return {
    id,
    type: tool.actionType,
    label: tool.label,
    status: tool.status === "pending" || tool.status === "running" ? "running" : tool.status,
    body: tool.progress ?? ("result" in tool ? tool.result : undefined),
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
  return (
    <div className="vibe-turn-timeline" aria-label="Agent activity">
      {parts.map((part, index) => {
        if (part.type === "reasoning") {
          return (
            <VibeReasoning
              key={part.id}
              reasoning={part.text}
              live={live && index === parts.length - 1}
            />
          );
        }
        if (part.type === "text") {
          const text = hideFailureDetails ? stripWorkspaceFailureText(part.text) : part.text;
          if (!text) return null;
          return (
            <div key={part.id} className="vibe-message-text">
              <VibeMarkdown text={stripQuestions(stripSuggestions(text))} imageBase={imageBase} />
              {live && index === parts.length - 1 && (
                <span className="vibe-cursor-blink" aria-hidden="true">
                  ▋
                </span>
              )}
            </div>
          );
        }
        if (part.type === "tool") {
          return <VibeActionRow key={part.id} action={toAction(part.tool.callId, part.tool)} />;
        }
        if (part.type === "commit") {
          return (
            <div key={part.id} className="vibe-commit-chip">
              ⑂ committed {part.sha.slice(0, 8)} — restore it from History
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
