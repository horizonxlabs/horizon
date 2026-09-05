import type { WorkspaceChatTurnPart } from "@evcp/types";

type WorkspaceMessage = {
  role: string;
  text?: string;
  parts?: WorkspaceChatTurnPart[];
  actions?: Array<{ status?: string; error?: string }>;
};

export type WorkspaceFailure = {
  title: string;
  description: string;
  retryLabel: string;
  retryPrompt?: string;
  technicalDetails: string;
};

const WARNING_LINE = /^\s*⚠️\s*(.+?)\s*$/m;

function messageFailure(message: WorkspaceMessage | undefined): string | undefined {
  if (!message) return undefined;
  const errorPart = message.parts
    ?.slice()
    .reverse()
    .find((part) => part.type === "error");
  if (errorPart?.type === "error") return errorPart.message;

  const failedTool = message.parts
    ?.slice()
    .reverse()
    .find((part) => part.type === "tool" && part.tool.status === "failed");
  if (failedTool?.type === "tool" && failedTool.tool.status === "failed") {
    return failedTool.tool.error;
  }

  const failedAction = message.actions
    ?.slice()
    .reverse()
    .find((action) => action.status === "failed");
  if (failedAction?.error) return failedAction.error;
  return message.text?.match(WARNING_LINE)?.[1];
}

export function stripWorkspaceFailureText(text: string): string {
  return text.replace(WARNING_LINE, "").trim();
}

export function deriveWorkspaceFailure({
  messages,
  status,
  technicalDetails
}: {
  messages: WorkspaceMessage[];
  status?: string;
  technicalDetails?: string;
}): WorkspaceFailure | undefined {
  if (status !== "Failed" && !technicalDetails) return undefined;

  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  const details = technicalDetails || messageFailure(latestAssistant);
  if (!details) return undefined;
  const retryPrompt = messages
    .slice()
    .reverse()
    .find((message) => message.role === "user")?.text;

  if (/vault|secret|credential|403/i.test(details)) {
    return {
      title: "Secure credentials are unavailable",
      description:
        "We couldn't access this project's secure credentials. Retry the connection or ask an administrator to check Vault access.",
      retryLabel: "Retry access",
      retryPrompt,
      technicalDetails: details
    };
  }

  return {
    title: "Workspace request failed",
    description: "We couldn't complete this request. Retry it, or review the technical details.",
    retryLabel: "Retry request",
    retryPrompt,
    technicalDetails: details
  };
}
