import { Button } from "@evcp/ui";
import { ArrowRight, Sparkles } from "lucide-react";
import type { QuickMessage } from "./quick-messages";

export function QuickMessages({
  items,
  disabled,
  onSubmit
}: {
  items: QuickMessage[];
  disabled: boolean;
  onSubmit: (prompt: string) => void;
}) {
  return (
    <section className="vibe-live-suggestions" aria-label="Suggested next">
      <div className="vibe-live-suggestions-head">
        <Sparkles size={13} aria-hidden="true" />
        <span>Suggested next</span>
      </div>
      <div className="vibe-live-suggestion-track">
        {items.map((item, index) => (
          <Button
            key={item.id}
            variant="secondary"
            size="sm"
            type="button"
            className={`vibe-live-suggestion${index === 0 ? " is-recommended" : ""}`}
            aria-label={index === 0 ? `Recommended: ${item.label}` : item.label}
            title={item.prompt}
            disabled={disabled}
            onClick={() => onSubmit(item.prompt)}
          >
            {index === 0 ? <Sparkles size={13} aria-hidden="true" /> : null}
            <span>{item.label}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
        ))}
      </div>
    </section>
  );
}
