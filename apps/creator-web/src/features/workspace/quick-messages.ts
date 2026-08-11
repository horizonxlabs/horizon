import type { PrdSectionDto, WorkspaceAgentMode } from "@evcp/api-client";
import type { CreatorProjectView } from "@/shared/types";
import type { VibeMessage } from "./vibe-stream";

export type QuickMessageIntent = "continue" | "product" | "quality" | "release";

export type QuickMessage = {
  id: string;
  label: string;
  prompt: string;
  intent: QuickMessageIntent;
};

export type QuickMessageContext = {
  mode: WorkspaceAgentMode;
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

  if (context.mode === "plan") {
    candidates.push(
      {
        id: "review-prd",
        label: `Review ${shortProjectName} against PRD`,
        prompt: `Review ${projectName} against the current PRD without changing files. Identify gaps and use this product context: ${productContext}`,
        intent: "product"
      },
      {
        id: "prioritize-next",
        label: "Prioritize the next improvement",
        prompt: `Identify and prioritize the next highest-impact improvement for ${projectName}. Explain trade-offs and do not change files.`,
        intent: "product"
      },
      context.hasPreview
        ? {
            id: "assess-release-risks",
            label: "Check release risks",
            prompt: `Assess data, permission, usability, and release risks for ${projectName} without changing files.`,
            intent: "release"
          }
        : {
            id: "plan-first-preview",
            label: "Plan first preview",
            prompt: `Plan the smallest useful first preview for ${projectName} without changing files. Base the plan on: ${productContext}`,
            intent: "product"
          }
    );
  } else {
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
      ...(context.hasProjectFiles
        ? [
            {
              id: "use-project-files",
              label: "Use attached project files",
              prompt: `Use the attached project files to improve ${projectName}. Keep the implementation aligned with the current PRD and verify the preview.`,
              intent: "continue" as const
            }
          ]
        : []),
      {
        id: "polish-edge-states",
        label: "Polish loading & error states",
        prompt: `Improve loading, empty, error, and retry states in ${projectName}. Keep the existing visual direction and verify each state.`,
        intent: "quality"
      },
      {
        id: "mobile-ready",
        label: `Make ${shortProjectName} mobile-ready`,
        prompt: `Make ${projectName} responsive for narrow mobile screens while preserving desktop behavior. Verify keyboard focus and touch targets.`,
        intent: "quality"
      }
    );
  }

  return uniqueFirstThree(candidates);
}
