import { FilePenLine } from "lucide-react";
import type { TicketPrdChangeAction, TicketPrdChangeOutcome } from "./ticket-actions";

export function TicketDetailConversionButton({
  conversion,
  isConverting,
  disabled,
  onOutcome,
  onPendingChange
}: {
  conversion?: TicketPrdChangeAction;
  isConverting: boolean;
  disabled: boolean;
  onOutcome: (outcome: TicketPrdChangeOutcome) => void;
  onPendingChange: (isPending: boolean) => void;
}) {
  async function handleClick() {
    if (disabled || !conversion || conversion.isPending()) return;
    onPendingChange(true);
    const outcome = await conversion.run();
    if (outcome) onOutcome(outcome);
    onPendingChange(false);
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled}>
      <FilePenLine size={16} /> {isConverting ? "Creating PRD Change…" : "Convert to PRD Change"}
    </button>
  );
}
