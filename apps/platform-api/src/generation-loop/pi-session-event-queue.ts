import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export class PiSessionEventQueue {
  private readonly events: AgentSessionEvent[] = [];
  private wake: (() => void) | undefined;
  private readonly unsubscribe: () => void;

  constructor(private readonly session: AgentSession) {
    this.unsubscribe = session.subscribe((event) => {
      this.events.push(event);
      const wake = this.wake;
      this.wake = undefined;
      wake?.();
    });
  }

  async *prompt(text: string): AsyncIterable<AgentSessionEvent> {
    let settled = false;
    let failure: unknown;
    const running = this.session
      .prompt(text, { expandPromptTemplates: false })
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        settled = true;
        const wake = this.wake;
        this.wake = undefined;
        wake?.();
      });
    while (!settled || this.events.length) {
      while (this.events.length) yield this.events.shift()!;
      if (!settled) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
    }
    await running;
    if (failure) throw failure;
  }

  close(): void {
    this.unsubscribe();
  }
}
