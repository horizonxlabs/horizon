import type { GoldenTemplate } from "../workspace-orchestrator/template";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner";
import type { ChatStreamEvent } from "./generation-types";
import type { StreamChunk } from "./governed-completion";

// Wrap a plain token stream (the non-governed path) as tagged chunks so both sources share one loop.
export async function* asTokenChunks(source: AsyncIterable<string>): AsyncIterable<StreamChunk> {
  for await (const text of source) yield { kind: "token", text };
}

// Run the workspace build validation, returning the error message (compilation failure) or null when
// it passes — so the generation loop can feed the errors back for a self-heal round instead of
// throwing straight to a rollback.
export async function validateBuild(
  guard: { validate(projectId: string): Promise<void> },
  projectId: string
): Promise<string | null> {
  try {
    await guard.validate(projectId);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

// The next-round prompt fed back after a failed build (opencode-style: surface the diagnostics and
// ask for a minimal fix). ANSI colour codes from the build output are stripped and it is clipped.
export function buildErrorFeedback(buildError: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = buildError.replace(/\[[0-9;]*m/g, "").trim().slice(0, 4000);
  return `The build FAILED. Fix ONLY the syntax/type errors below using <action type="edit"> edits (SEARCH/REPLACE) that touch just the broken lines — change nothing else, add no features. Common causes: a multi-line string in double quotes (use backticks), a missing closing ) or }, a stray ;.\n<build_errors>\n${clean}\n</build_errors>`;
}

// Governed skill/knowledge context injected into the generation prompt. Skills use opencode-style
// progressive disclosure: only names+descriptions go into the system prompt; a skill's full
// instructions arrive on demand when the model emits <action type="skill" name="...">.
export interface GovernedContext {
  availableSkills: Array<{ name: string; description: string }>;
  skillInstructions: Record<string, string>;
  knowledgeExcerpts: string[];
}

// The next-round prompt fed back to the model after it requests a skill — the loaded instructions
// (opencode's <skill_content> envelope) or a graceful note when the named skill is unavailable.
export function buildSkillLoadFeedback(name: string, instruction: string | undefined): string {
  return instruction
    ? `<skill_content name="${name}">\n# Skill: ${name}\n\n${instruction.trim()}\n</skill_content>\n\nApply this skill now and continue building exactly what the user asked for.`
    : `The skill "${name}" is not available. Continue with the guidance you already have.`;
}

// Runs a shell action while streaming its output to the caller as action_chunk events (bridging the
// runner's onShellOutput callback into the generator via a queue), then returns the result.
export async function* runShellStreaming(
  actionRunner: ActionRunner,
  template: GoldenTemplate,
  containerId: string,
  projectId: string,
  action: RunnableAction,
  actionId: string
): AsyncGenerator<ChatStreamEvent, ActionResult> {
  const queue: string[] = [];
  let notify: (() => void) | null = null;
  let done = false;
  const wake = () => {
    const resolve = notify;
    notify = null;
    resolve?.();
  };
  const run = actionRunner
    .runAction({
      containerId,
      projectId,
      template,
      action,
      onShellOutput: (chunk) => {
        queue.push(chunk);
        wake();
      }
    })
    .finally(() => {
      done = true;
      wake();
    });
  for (;;) {
    while (queue.length > 0) yield { type: "action_chunk", actionId, content: queue.shift() as string };
    if (done) break;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
  return await run;
}
