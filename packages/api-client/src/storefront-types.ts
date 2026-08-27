export type StorefrontAppCardDto = {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  subdomain?: string;
  subdomainUrl?: string;
  name: string;
  description: string;
  ownerName: string;
  route: string;
  accessStatus: "active" | "available" | "pending";
  installStatus?: "installed" | "not_installed" | "disabled";
  installationId?: string;
  installedAt?: string;
  myRole?: string;
  health: string;
  version: string;
  lastUpdated: string;
  primaryAction: string;
};

export type StorefrontAppDetailResponse = StorefrontAppCardDto & {
  ownerUserId: string;
  department: string;
  accessMode: string;
  availableRoles?: string[];
  releaseNotes: string[];
  supportContact: string;
  actions: Array<
    | "open"
    | "install"
    | "uninstall"
    | "request_access"
    | "submit_ticket"
    | "send_feedback"
    | "view_status"
  >;
};
