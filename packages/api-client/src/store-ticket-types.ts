export type StoreTicketInput = {
  type: "bug" | "feedback" | "feature_request";
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  deviceInfo: string;
  screenshotUrl?: string;
};

export type StoreTicketTimelineEntryDto = {
  id: string;
  ticketId?: string;
  status: string;
  label: string;
  actorId?: string;
  occurredAt?: string;
};

export type StoreTicketResponse = {
  id: string;
  ticketNumber: string;
  appSlug: string;
  appName?: string;
  type?: string;
  priority?: string;
  title?: string;
  description?: string;
  deviceInfo?: string;
  status: string;
  timeline: StoreTicketTimelineEntryDto[];
};

export type ConvertTicketToPrdChangeInput = {
  ticketId: string;
  title: string;
  proposedRequirement: string;
  affectedSections: string[];
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
};

export type PrdChangeRequestDto = {
  id: string;
  projectId: string;
  sourceType: "ticket" | "prompt" | "manual";
  sourceTicketId?: string;
  title: string;
  proposedRequirement: string;
  affectedSections: string[];
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "draft" | "pending_approval" | "approved" | "rejected" | "changes_requested";
  requestedByUserId: string;
  approvedPrdVersionId?: string;
  createdAt: string;
  updatedAt: string;
};
