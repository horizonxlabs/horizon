import type { PrdSectionDto } from "@evcp/api-client";
import type { CreatorProjectView } from "@/shared/types";
import { extractSuggestions } from "./vibe-suggest";
import type { VibeMessage } from "./vibe-stream";

export type QuickMessageIntent = "continue" | "product" | "quality" | "release";

export type QuickMessage = {
  id: string;
  label: string;
  prompt: string;
  intent: QuickMessageIntent;
};

export type QuickMessageContext = {
  project: Pick<CreatorProjectView, "name" | "appType">;
  prdSummary?: string;
  prdSections?: PrdSectionDto[];
  messages: VibeMessage[];
  hasPreview: boolean;
  hasProjectFiles: boolean;
};

const normalize = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

const clip = (value: string, maximum = 30) =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;

function latestFailedAction(messages: VibeMessage[]) {
  return [...messages]
    .reverse()
    .flatMap((message) => [...message.actions].reverse())
    .find((action) => action.status === "failed");
}

function latestUserRequest(messages: VibeMessage[]) {
  return normalize([...messages].reverse().find((message) => message.role === "user")?.text);
}

function uniqueFirstThree(candidates: QuickMessage[]): QuickMessage[] {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const key = normalize(candidate.prompt).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function buildQuickMessages(context: QuickMessageContext): QuickMessage[] {
  // Model-authored suggestions on the latest assistant reply are the freshest signal —
  // they know what was just built. The heuristics below remain the fallback.
  const lastAssistant = [...context.messages].reverse().find((m) => m.role === "assistant");
  if (lastAssistant) {
    const { suggestions } = extractSuggestions(lastAssistant.text);
    if (suggestions.length) {
      return suggestions.map((s) => ({ ...s, intent: "continue" as const }));
    }
  }
  const projectName = normalize(context.project.name) || "this project";
  const shortProjectName = clip(projectName);
  const appType = normalize(context.project.appType) || "application";
  const section = context.prdSections?.find(
    (item) => normalize(item.title) || normalize(item.body)
  );
  const productContext =
    normalize(context.prdSummary) ||
    normalize(section?.body) ||
    normalize(section?.title) ||
    latestUserRequest(context.messages) ||
    `${appType} requirements`;
  const failure = latestFailedAction(context.messages);
  const candidates: QuickMessage[] = [];

  if (failure) {
    candidates.push({
      id: "repair-last-action",
      label: `Fix ${clip(normalize(failure.label) || "last failed change", 26)}`,
      prompt: `Diagnose and fix the failed "${normalize(failure.label) || "workspace change"}" action in ${projectName}. Preserve working behavior and verify the preview after the repair.`,
      intent: "continue"
    });
  }

  candidates.push(
    context.hasPreview
      ? {
          id: "next-prd-improvement",
          label: `Improve ${shortProjectName}`,
          prompt: `Implement the next highest-impact PRD improvement for ${projectName}. Use this product context: ${productContext}. Preserve current working behavior and verify the preview.`,
          intent: "product"
        }
      : {
          id: "build-first-preview",
          label: "Build first preview",
          prompt: `Build the smallest useful first preview for ${projectName}, a ${appType}. Use this product context: ${productContext}. Verify it renders successfully.`,
          intent: "product"
        },
    {
      id: "review-prd",
      label: `Review ${shortProjectName} against PRD`,
      prompt: `Review ${projectName} against the current PRD without changing files. Identify gaps and use this product context: ${productContext}`,
      intent: "product"
    },
    ...(context.hasProjectFiles
      ? [
          {
            id: "use-project-files",
            label: "Improve with project files",
            prompt: `Improve ${projectName} using the attached project files. Keep the implementation aligned with the current PRD and verify the preview.`,
            intent: "continue" as const
          }
        ]
      : []),
    {
      id: "polish-edge-states",
      label: "Improve loading & error states",
      prompt: `Improve loading, empty, error, and retry states in ${projectName}. Keep the existing visual direction and verify each state.`,
      intent: "quality"
    }
  );

  return uniqueFirstThree(candidates);
}
