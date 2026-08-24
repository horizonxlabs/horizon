import type { ConvertTicketToPrdChangeInput } from "@evcp/api-client";
import type { CreatorTicketInboxItem } from "./use-creator-ticket-inbox";

type TicketInboxClient = {
  request<T>(path: string): Promise<T>;
};

type TicketPrdChangeClient = {
  convertTicketToPrdChange(
    projectId: string,
    input: ConvertTicketToPrdChangeInput
  ): Promise<unknown>;
};

type TicketPrdChangeActionOptions = {
  projectId: string;
  ticket: CreatorTicketInboxItem;
  client: TicketPrdChangeClient;
  refreshInbox: () => Promise<void>;
  refreshPrdState: (projectId: string) => Promise<void>;
};

export function refreshCreatorTicketInbox(
  projectId: string,
  client: TicketInboxClient
): Promise<CreatorTicketInboxItem[]> {
  return client.request<CreatorTicketInboxItem[]>(
    `/creator/projects/${encodeURIComponent(projectId)}/tickets`
  );
}

function conversionInput(ticket: CreatorTicketInboxItem): ConvertTicketToPrdChangeInput {
  return {
    ticketId: ticket.id,
    title: `Address ${ticket.ticketNumber}: ${ticket.title}`,
    proposedRequirement: ticket.description || ticket.title,
    affectedSections: ["functional_requirements"],
    acceptanceCriteria: [`Resolve ${ticket.ticketNumber} and preserve existing access behavior.`],
    riskLevel: ticket.priority === "high" ? "high" : "medium"
  };
}

export type TicketPrdChangeAction = {
  isPending: () => boolean;
  run: () => Promise<TicketPrdChangeOutcome | undefined>;
};

export type TicketPrdChangeOutcome =
  | { kind: "pending"; message: string }
  | { kind: "success"; message: string }
  | { kind: "partial-success"; message: string; technicalDetails: string }
  | { kind: "failure"; message: string; technicalDetails: string };

export type TicketPrdChangeActionState = {
  pending: boolean;
  outcome?: TicketPrdChangeOutcome;
};

const idleTicketPrdChangeActionState: TicketPrdChangeActionState = {
  pending: false
};
const ticketPrdChangeActionStates = new Map<string, TicketPrdChangeActionState>();
const ticketPrdChangeActionListeners = new Map<string, Set<() => void>>();
const ticketPrdChangeRequests = new Map<string, Promise<TicketPrdChangeOutcome | undefined>>();

function ticketPrdChangeKey(projectId: string, ticketId: string): string {
  return `${encodeURIComponent(projectId)}:${encodeURIComponent(ticketId)}`;
}

function updateTicketPrdChangeActionState(key: string, state: TicketPrdChangeActionState): void {
  ticketPrdChangeActionStates.set(key, state);
  ticketPrdChangeActionListeners.get(key)?.forEach((listener) => listener());
}

export function getTicketPrdChangeActionState(
  projectId: string,
  ticketId: string
): TicketPrdChangeActionState {
  return (
    ticketPrdChangeActionStates.get(ticketPrdChangeKey(projectId, ticketId)) ??
    idleTicketPrdChangeActionState
  );
}

export function subscribeTicketPrdChangeAction(
  projectId: string,
  ticketId: string,
  listener: () => void
): () => void {
  const key = ticketPrdChangeKey(projectId, ticketId);
  const listeners = ticketPrdChangeActionListeners.get(key) ?? new Set();
  listeners.add(listener);
  ticketPrdChangeActionListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) ticketPrdChangeActionListeners.delete(key);
  };
}

export function createTicketPrdChangeAction({
  projectId,
  ticket,
  client,
  refreshInbox,
  refreshPrdState
}: TicketPrdChangeActionOptions): TicketPrdChangeAction {
  const key = ticketPrdChangeKey(projectId, ticket.id);

  return {
    isPending: () => getTicketPrdChangeActionState(projectId, ticket.id).pending,
    run(): Promise<TicketPrdChangeOutcome | undefined> {
      const existing = ticketPrdChangeRequests.get(key);
      if (existing) return existing;
      if (!ticket.actions.includes("convert_to_prd_change")) {
        return Promise.resolve(undefined);
      }

      updateTicketPrdChangeActionState(key, {
        pending: true,
        outcome: { kind: "pending", message: "Creating PRD change." }
      });
      let resolveRequest: (outcome: TicketPrdChangeOutcome | undefined) => void = () => undefined;
      const request = new Promise<TicketPrdChangeOutcome | undefined>((resolve) => {
        resolveRequest = resolve;
      });
      ticketPrdChangeRequests.set(key, request);
      void (async () => {
        let outcome: TicketPrdChangeOutcome;
        try {
          await client.convertTicketToPrdChange(projectId, conversionInput(ticket));
          try {
            await Promise.all([refreshInbox(), refreshPrdState(projectId)]);
            outcome = { kind: "success", message: "PRD change created." };
          } catch (error) {
            outcome = {
              kind: "partial-success",
              message: "PRD change was created, but the latest governed state could not be loaded.",
              technicalDetails:
                error instanceof Error ? error.message : "Governed state refresh failed."
            };
          }
        } catch (error) {
          outcome = {
            kind: "failure",
            message: "PRD change could not be created.",
            technicalDetails:
              error instanceof Error ? error.message : "The conversion request failed."
          };
        } finally {
          ticketPrdChangeRequests.delete(key);
        }
        updateTicketPrdChangeActionState(key, { pending: false, outcome });
        resolveRequest(outcome);
      })();
      return request;
    }
  };
}
