import { ArrowRight, MessageSquare } from "lucide-react";
import { Button } from "@evcp/ui";
import { CreatorEmptyState } from "@/shared/CreatorEmptyState";

export function WorkspaceDatabaseEmpty({ onOpenChat }: { onOpenChat?: () => void }) {
  return (
    <section className="workspace-database-empty" aria-label="Project database">
      <CreatorEmptyState
        eyebrow="Your app’s data, organized"
        title="A home for your app’s data"
        description="No tables yet. Tell Horizon what your app needs to remember, and build your database together in chat."
        action={
          onOpenChat ? (
            <Button variant="primary" type="button" onClick={onOpenChat}>
              <MessageSquare size={16} aria-hidden="true" />
              Design your database
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : null
        }
      >
        <p className="workspace-database-example-label">Start with something like</p>
        <blockquote>“Store customers, their orders, and payment status.”</blockquote>
        <p className="workspace-database-next">
          Your tables and records will appear here once created.
        </p>
      </CreatorEmptyState>
    </section>
  );
}
