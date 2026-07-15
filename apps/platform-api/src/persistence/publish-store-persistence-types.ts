export type DateValue = Date | string;
type JsonValue = unknown;

export interface AppRecord {
  id: string; slug: string; name: string; status: string; projectId: string;
  databaseSchemaName?: string | null; roles?: AppRoleRecord[]; members?: AppMemberRecordData[];
  invitations?: AppInvitationRecord[]; accessRequests?: AppAccessRequestRecord[];
  createdAt?: DateValue; updatedAt?: DateValue;
}
export interface AppRoleRecord { id: string; appId: string; key: string; name: string; permissions: string[] }
export interface UserRecord { id: string; email: string; name: string }
export interface AppMemberRecordData {
  appId: string; userId: string; roleId: string; user?: UserRecord; role?: AppRoleRecord;
  userType?: string; status?: string; lastAccessAt?: DateValue | null;
}
export interface AppInstallationRecord {
  id: string; appId: string; userId: string; status: string; installedAt: DateValue;
  disabledAt?: DateValue | null; lastOpenedAt?: DateValue | null;
}
export interface AppInvitationRecord {
  id: string; appId: string; projectId: string; email: string; userType: string; roleKey: string;
  invitedByUserId: string; status: string; policyWarning?: string | null; expiresAt?: DateValue | null;
  note?: string | null; createdAt: DateValue;
}
export interface AppAccessRequestRecord {
  id: string; appId: string; projectId: string; requesterEmail: string; requestedRoleKey: string;
  reason: string; status: string; decidedByUserId?: string | null; decidedAt?: DateValue | null;
  createdAt: DateValue;
}
export interface AppManifestRecord {
  id: string; appId: string; projectId: string; manifestVersion: string; prdVersionId: string;
  prdVersion: string; frontendCheckpointId: string; route: string; authMode: string;
  roleSnapshot: JsonValue; databaseSnapshot: JsonValue; manifest: JsonValue; generatedAt: DateValue;
  sourceCommitSha?: string | null;
  deploymentRevisionId?: string | null;
}
export interface PublishRequestRecordData {
  id: string; appId: string; projectId: string; status: string; requestedByUserId: string;
  manifestVersion: string; blockingItems: JsonValue; createdAt: DateValue; publishedAt?: DateValue | null;
}
export interface DeploymentRecordData {
  id: string; appId: string; projectId: string; publishRequestId: string; status: string;
  environment: string; route: string; manifestVersion: string; prdVersion: string;
  frontendCheckpointId: string; publishedByUserId: string; publishedAt: DateValue;
  deploymentRevisionId?: string | null;
  runtimeRevision?: number | null;
  sourceCommitSha?: string | null;
  imageTag?: string | null;
  imageDigest?: string | null;
  containerName?: string | null;
}
export interface AppStoreRegistryEntryRecord {
  id: string; appId: string; projectId: string; deploymentRecordId: string; slug: string;
  name: string; route: string; status: string; visibility: string; accessMode: string;
  roleKeys: string[]; ownerUserId: string; manifestVersion: string; publishedAt: DateValue;
}
export interface SupportTicketRecord {
  id: string; ticketNumber: string; appId: string; appSlug: string; projectId: string;
  submittedByUserId: string; submittedByEmail: string; type: string; priority: string;
  title: string; description: string; deviceInfo: string; screenshotUrl?: string | null;
  status: string; assignedToUserId: string; createdAt: DateValue; updatedAt: DateValue;
  timeline?: SupportTicketTimelineEntryRecord[];
}
export interface SupportTicketTimelineEntryRecord {
  id: string; ticketId: string; status: string; label: string; actorUserId: string; occurredAt: DateValue;
}
export interface InAppNotificationRecord {
  id: string; userId: string; projectId?: string | null; type: string; title: string;
  body: string; read: boolean; createdAt: DateValue;
}

export interface PublishStorePersistenceClient {
  app: {
    findFirst(args: { where: { projectId?: string; slug?: string; id?: string }; include?: Record<string, unknown> }): Promise<AppRecord | null>;
    upsert(args: { where: { id: string }; update: Partial<AppRecord>; create: AppRecord; include?: Record<string, unknown> }): Promise<AppRecord>;
    update(args: { where: { id: string }; data: Partial<AppRecord> }): Promise<AppRecord>;
  };
  appRole: {
    findMany(args: { where: { appId: string } }): Promise<AppRoleRecord[]>;
    upsert(args: { where: { appId_key: { appId: string; key: string } }; update: Partial<AppRoleRecord>; create: AppRoleRecord }): Promise<AppRoleRecord>;
  };
  appMember: {
    findMany(args: { where: { appId: string }; include?: Record<string, unknown> }): Promise<AppMemberRecordData[]>;
    create(args: { data: { appId: string; userId: string; roleId: string } }): Promise<AppMemberRecordData>;
  };
  appInstallation: {
    findFirst(args: { where: { appId?: string; userId?: string; status?: string } }): Promise<AppInstallationRecord | null>;
    findMany(args: { where: { appId?: string; userId?: string; status?: string }; orderBy?: { installedAt?: "asc" | "desc" } }): Promise<AppInstallationRecord[]>;
    upsert(args: { where: { appId_userId: { appId: string; userId: string } }; update: Partial<AppInstallationRecord>; create: AppInstallationRecord }): Promise<AppInstallationRecord>;
    update(args: { where: { id: string }; data: Partial<AppInstallationRecord> }): Promise<AppInstallationRecord>;
  };
  appInvitation: {
    findMany(args: { where: { appId?: string; projectId?: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<AppInvitationRecord[]>;
    create(args: { data: AppInvitationRecord }): Promise<AppInvitationRecord>;
  };
  appAccessRequest: {
    findMany(args: { where: { appId?: string; projectId?: string; requesterEmail?: string; status?: string; requestedRoleKey?: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<AppAccessRequestRecord[]>;
    create(args: { data: AppAccessRequestRecord }): Promise<AppAccessRequestRecord>;
    update(args: { where: { id: string }; data: Partial<AppAccessRequestRecord> }): Promise<AppAccessRequestRecord>;
  };
  appManifest: {
    findFirst(args: { where: { projectId?: string; appId?: string } }): Promise<AppManifestRecord | null>;
    upsert(args: { where: { appId: string }; update: Partial<AppManifestRecord>; create: AppManifestRecord }): Promise<AppManifestRecord>;
  };
  publishRequest: {
    findMany(args?: { where?: { projectId?: string; appId?: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<PublishRequestRecordData[]>;
    create(args: { data: PublishRequestRecordData }): Promise<PublishRequestRecordData>;
  };
  deploymentRecord: {
    findMany(args: { where: { projectId?: string; appId?: string }; orderBy?: { publishedAt?: "asc" | "desc" } }): Promise<DeploymentRecordData[]>;
    create(args: { data: DeploymentRecordData }): Promise<DeploymentRecordData>;
  };
  appStoreRegistryEntry: {
    findMany(args?: { where?: { status?: string }; orderBy?: { publishedAt?: "asc" | "desc" } }): Promise<AppStoreRegistryEntryRecord[]>;
    findFirst(args: { where: { slug?: string; projectId?: string; appId?: string } }): Promise<AppStoreRegistryEntryRecord | null>;
    upsert(args: { where: { appId: string }; update: Partial<AppStoreRegistryEntryRecord>; create: AppStoreRegistryEntryRecord }): Promise<AppStoreRegistryEntryRecord>;
  };
  supportTicket: {
    findUnique(args: { where: { id: string }; include?: { timeline?: boolean } }): Promise<SupportTicketRecord | null>;
    findMany(args?: { where?: { projectId?: string; submittedByUserId?: string }; include?: { timeline?: boolean }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<SupportTicketRecord[]>;
    create(args: { data: SupportTicketRecord }): Promise<SupportTicketRecord>;
  };
  supportTicketTimelineEntry: {
    findMany(args: { where: { ticketId: string }; orderBy?: { occurredAt?: "asc" | "desc" } }): Promise<SupportTicketTimelineEntryRecord[]>;
    create(args: { data: SupportTicketTimelineEntryRecord }): Promise<SupportTicketTimelineEntryRecord>;
  };
  inAppNotification: {
    findMany(args: { where: { userId: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<InAppNotificationRecord[]>;
    create(args: { data: InAppNotificationRecord }): Promise<InAppNotificationRecord>;
  };
}
