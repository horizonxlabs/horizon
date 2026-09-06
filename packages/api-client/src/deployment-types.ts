// Container-publish (Staging → Production) DTOs. Mirrors `WorkspaceDeployment` from @evcp/types.
// Kept in a sibling file so packages/api-client/src/index.ts stays within its large-file ceiling.

export type WorkspaceDeploymentDto = {
  id: string;
  projectId: string;
  slug: string;
  environment: "dev" | "staging" | "production";
  commitSha: string;
  imageTag: string;
  containerId: string | null;
  publishedByUserId: string;
  healthStatus: "pending" | "healthy" | "failed";
  createdAt: string;
};

/** Response shape for a container publish or a staging → production promote. */
export type WorkspacePublishResponse = {
  deployment: WorkspaceDeploymentDto;
};

// App-store publish DTOs (separate subsystem). Relocated here (and re-exported from index.ts) purely
// to keep index.ts within its large-file ceiling — shapes and public API are unchanged.
export type PublishRequestDto = {
  id: string;
  projectId?: string;
  appId?: string;
  status: "blocked" | "published";
  requestedByUserId?: string;
  manifestVersion: string;
  blockingItems: string[];
  createdAt?: string;
  publishedAt?: string;
};

export type DeploymentRecordDto = {
  id: string;
  projectId?: string;
  appId?: string;
  publishRequestId?: string;
  status: "published" | "failed";
  environment?: "app_store";
  route: string;
  subdomain?: string;
  subdomainUrl?: string;
  manifestVersion?: string;
  prdVersion?: string;
  frontendCheckpointId?: string;
  publishedByUserId?: string;
  publishedAt?: string;
};

export type AppStoreRegistryEntryDto = {
  id: string;
  appId?: string;
  projectId?: string;
  slug: string;
  subdomain?: string;
  subdomainUrl?: string;
  name?: string;
  route?: string;
  status: "published";
  visibility?: "public" | "restricted";
  accessMode?: "public" | "membership_or_invite";
  roleKeys?: string[];
  ownerUserId?: string;
  deploymentId?: string;
  manifestVersion?: string;
  publishedAt?: string;
};
