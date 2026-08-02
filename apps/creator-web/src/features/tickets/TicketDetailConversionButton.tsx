import { FilePenLine } from "lucide-react";
import type { TicketPrdChangeAction } from "./ticket-actions";

export function TicketDetailConversionButton({
  conversion,
  isConverting,
  disabled,
  onMessage,
  onPendingChange
}: {
  conversion?: TicketPrdChangeAction;
  isConverting: boolean;
  disabled: boolean;
  onMessage: (message: string) => void;
  onPendingChange: (isPending: boolean) => void;
}) {
  async function handleClick() {
    if (disabled || !conversion || conversion.isPending()) return;
    onPendingChange(true);
    onMessage("Creating PRD change through Platform API.");
    const message = await conversion.run();
    if (message) onMessage(message);
    onPendingChange(false);
  }

  return (
    <button type="button" onClick={handleClick} disabled={disabled}>
      <FilePenLine size={16} /> {isConverting ? "Creating PRD Change…" : "Convert to PRD Change"}
    </button>
  );
}
