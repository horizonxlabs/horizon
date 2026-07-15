import { randomUUID } from "node:crypto";
import type { WorkspaceAgentMode } from "@evcp/types";
import type { PlatformUser } from "../platform-services";
import type { GenerationServiceDeps } from "./generation-service";

export async function resolveGovernedCompletion(
  completion: NonNullable<GenerationServiceDeps["governedCompletion"]>,
  input: { actor?: PlatformUser; projectId: string },
  prompt: string,
  agentMode: WorkspaceAgentMode
): Promise<string> {
  if (!input.actor)
    throw new Error("Governed AI execution requires the authenticated workspace actor");
  return completion({
    actor: input.actor,
    projectId: input.projectId,
    scenario: agentMode === "plan" ? "requirement_analysis" : "frontend_coding",
    prompt,
    requestId: `workspace_chat_${randomUUID()}`
  });
}

export async function* streamText(text: string): AsyncIterable<string> {
  const chunkSize = 256;
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    yield text.slice(offset, offset + chunkSize);
  }
}
