import { ListOrdered, X } from "lucide-react";
import type { QueuedPrompt } from "./vibe-queue";

// The waiting bucket above the composer: requests typed while the AI is busy line up here
// in order. The head runs next; ✕ removes an item before it runs. Nothing renders when idle.
export function PromptQueue({
  items,
  onRemove
}: {
  items: QueuedPrompt[];
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="vibe-prompt-queue" aria-label="Queued requests">
      <div className="vibe-prompt-queue-head">
        <ListOrdered size={13} aria-hidden="true" />
        <span>Queued work ({items.length})</span>
      </div>
      <ol className="vibe-prompt-queue-list">
        {items.map((item, index) => (
          <li key={item.id} className="vibe-prompt-queue-item">
            <span className={`vibe-prompt-queue-status${index === 0 ? " is-next" : ""}`}>
              {index === 0 ? "Next" : `Queue ${index + 1}`}
            </span>
            <span className="vibe-prompt-queue-text" title={item.prompt}>
              {item.prompt}
            </span>
            {item.mode === "plan" && <span className="vibe-prompt-queue-mode">Plan</span>}
            <button
              type="button"
              className="vibe-prompt-queue-remove"
              aria-label={`Remove from queue: ${item.prompt}`}
              onClick={() => onRemove(item.id)}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
