import type { GoldenTemplate } from "../workspace-orchestrator/template";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner";
import { stripAnsi } from "./generation-action-utils";
import type { ChatStreamEvent } from "./generation-types";
import type { StreamChunk } from "./governed-completion";

// Wrap a plain token stream (the non-governed path) as tagged chunks so both sources share one loop.
export async function* asTokenChunks(source: AsyncIterable<string>): AsyncIterable<StreamChunk> {
  for await (const text of source) yield { kind: "token", text };
}

// Build output lines that carry zero diagnostic value: the Next.js telemetry banner and
// progress chatter. They used to fill the whole 300-char bug-box excerpt (the CMMS case:
// the user's Fix request quoted the telemetry notice instead of the actual type error).
const BUILD_NOISE = [
  /next\.js now collects.*telemetry/i,
  /^\s*attention:?\s*$/i,
  /this information is used to shape/i,
  /you can learn more, including how to opt-out/i,
  /nextjs\.org\/telemetry/i,
  /creating an optimized production build/i,
  /linting and checking validity of types\s*\.*\s*$/i
];

// Reduce a raw build failure to what a human (or the model) can act on: no ANSI, no noise
// lines, and when a real compiler marker exists, start THERE.
export function cleanBuildError(raw: string): string {
  const text = stripAnsi(raw);
  const marker = text.search(
    /Failed to compile|Type error:|Syntax error|error TS\d+|Module not found|Unhandled/
  );
  const scoped = marker >= 0 ? text.slice(marker) : text;
  return scoped
    .split("\n")
    .filter((line) => !BUILD_NOISE.some((noise) => noise.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    return cleanBuildError((error as Error).message);
  }
}

// The next-round prompt fed back after a failed build (opencode-style: surface the diagnostics and
// ask for a minimal fix). ANSI colour codes from the build output are stripped and it is clipped.
export function buildErrorFeedback(buildError: string): string {
  const clean = stripAnsi(buildError).trim().slice(0, 4000);
  return `The build FAILED. Fix ONLY the syntax/type errors below using <action type="edit"> edits (SEARCH/REPLACE) that touch just the broken lines — change nothing else, add no features. Common causes: a multi-line string in double quotes (use backticks), a missing closing ) or }, a stray ;.\n<build_errors>\n${clean}\n</build_errors>`;
}

// Governed skill/knowledge context injected into the generation prompt. Skills use opencode-style
// progressive disclosure: only names+descriptions go into the system prompt; a skill's full
// instructions arrive on demand when the model emits <action type="skill" name="...">.
export interface GovernedContext {
  availableSkills: Array<{ name: string; description: string }>;
  skillInstructions: Record<string, string>;
  knowledgeExcerpts: string[];
  productSpec?: string;
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
        queue.push(stripAnsi(chunk));
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
