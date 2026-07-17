import type { GoldenTemplate } from "../workspace-orchestrator/template";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner";
import type { ChatStreamEvent } from "./generation-types";
import type { StreamChunk } from "./governed-completion";

// Wrap a plain token stream (the non-governed path) as tagged chunks so both sources share one loop.
export async function* asTokenChunks(source: AsyncIterable<string>): AsyncIterable<StreamChunk> {
  for await (const text of source) yield { kind: "token", text };
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
