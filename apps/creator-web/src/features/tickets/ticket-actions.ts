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

export function createTicketPrdChangeAction({
  projectId,
  ticket,
  client,
  refreshInbox,
  refreshPrdState
}: TicketPrdChangeActionOptions) {
  let pending = false;

  return {
    isPending: () => pending,
    async run(): Promise<string | undefined> {
      if (pending || !ticket.actions.includes("convert_to_prd_change")) return undefined;
      pending = true;
      try {
        await client.convertTicketToPrdChange(projectId, conversionInput(ticket));
        try {
          await Promise.all([refreshInbox(), refreshPrdState(projectId)]);
          return "PRD change created through Platform API.";
        } catch {
          return "PRD change created through Platform API. Refreshing governed state failed.";
        }
      } catch (error) {
        return error instanceof Error
          ? `PRD change creation failed: ${error.message}`
          : "PRD change creation failed. No local success record was created.";
      } finally {
        pending = false;
      }
    }
  };
}
