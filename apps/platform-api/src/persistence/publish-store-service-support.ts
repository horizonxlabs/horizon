import {
  buildSubdomainUrl,
  type AppStoreVisibility,
  type PublishAccessUrlConfigDto
} from "@evcp/api-client";
import { PermissionError } from "../platform-errors";
import type {
  AppMemberRecord,
  AppStoreRegistryEntry,
  DeploymentRecord,
  InAppNotification,
  PlatformUser,
  PlatformProject,
  StorefrontAppCard
} from "../platform-services";
import type {
  AppStoreRegistryEntryRecord,
  DeploymentRecordData
} from "./publish-store-persistence-types";
import { toIsoString } from "./publish-store-record-utils";

export const DEFAULT_PUBLISH_ACCESS_URL_CONFIG: PublishAccessUrlConfigDto = {
  baseDomain: "localhost",
  secure: false,
  port: 9800
};

export class SubdomainConflictError extends Error {
  readonly code = "SUBDOMAIN_TAKEN";
  readonly status = 409;

  constructor() {
    super("This subdomain is already in use.");
    this.name = "SubdomainConflictError";
  }
}

export function assertSubdomainClaimAvailable(
  label: string,
  existingProjectId: string | undefined,
  projectId: string
): string {
  const subdomain = label.trim().toLowerCase();
  if (!existingProjectId || existingProjectId === projectId) return subdomain;
  throw new SubdomainConflictError();
}

export function requireProjectOwnerAccess(
  actor: Pick<PlatformUser, "id" | "role">,
  project: Pick<PlatformProject, "ownerUserId">
): void {
  if (actor.role !== "admin" && actor.role !== "creator")
    throw new PermissionError(`Role ${actor.role} cannot access this resource`);
  if (actor.role !== "admin" && project.ownerUserId !== actor.id)
    throw new PermissionError(`Role ${actor.role} cannot access this resource`);
}

export function buildConfiguredSubdomainUrl(
  subdomain: string | undefined,
  accessUrlConfig: PublishAccessUrlConfigDto
): string | undefined {
  return subdomain ? buildSubdomainUrl(subdomain, accessUrlConfig) : undefined;
}

export function mapRegistryEntry(
  record: AppStoreRegistryEntryRecord,
  accessUrlConfig: PublishAccessUrlConfigDto
): AppStoreRegistryEntry {
  const subdomain = record.subdomain ?? undefined;
  const visibility: AppStoreVisibility = record.visibility === "public" ? "public" : "restricted";
  return {
    id: record.id,
    appId: record.appId,
    projectId: record.projectId,
    slug: record.slug,
    subdomain,
    subdomainUrl: buildConfiguredSubdomainUrl(subdomain, accessUrlConfig),
    name: record.name,
    route: record.route,
    status: "published",
    visibility,
    accessMode: visibility === "public" ? "public" : "membership_or_invite",
    roleKeys: [...record.roleKeys],
    ownerUserId: record.ownerUserId,
    deploymentId: record.deploymentRecordId,
    manifestVersion: record.manifestVersion,
    publishedAt: toIsoString(record.publishedAt)
  };
}

export function mapDeploymentRecord(
  record: DeploymentRecordData,
  registryEntry?: AppStoreRegistryEntry
): DeploymentRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    appId: record.appId,
    publishRequestId: record.publishRequestId,
    status: record.status === "published" ? "published" : "failed",
    environment: "app_store",
    route: record.route,
    manifestVersion: record.manifestVersion,
    prdVersion: record.prdVersion,
    frontendCheckpointId: record.frontendCheckpointId,
    publishedByUserId: record.publishedByUserId,
    deploymentRevisionId: record.deploymentRevisionId ?? undefined,
    runtimeRevision: record.runtimeRevision ?? undefined,
    sourceCommitSha: record.sourceCommitSha ?? undefined,
    imageTag: record.imageTag ?? undefined,
    imageDigest: record.imageDigest ?? undefined,
    containerName: record.containerName ?? undefined,
    publishedAt: toIsoString(record.publishedAt),
    subdomain: registryEntry?.subdomain,
    subdomainUrl: registryEntry?.subdomainUrl
  };
}

export function attachRegistrySubdomain(
  deployment: DeploymentRecord,
  registryEntry?: Pick<AppStoreRegistryEntry, "subdomain" | "subdomainUrl">
): DeploymentRecord {
  return {
    ...deployment,
    subdomain: registryEntry?.subdomain,
    subdomainUrl: registryEntry?.subdomainUrl
  };
}

export function createLegacyStorefrontCard(input: {
  entry: AppStoreRegistryEntry;
  project: Pick<PlatformProject, "appType" | "targetDepartment">;
  member?: Pick<AppMemberRecord, "appId" | "lastAccessAt" | "roleName">;
  hasPendingAccessRequest: boolean;
  ownerName?: string;
  actorId: string;
}): StorefrontAppCard {
  const accessStatus =
    input.entry.visibility === "public"
      ? "active"
      : input.member
        ? "active"
        : input.hasPendingAccessRequest
          ? "pending"
          : "available";
  return {
    id: input.entry.id,
    appId: input.entry.appId,
    projectId: input.entry.projectId,
    slug: input.entry.slug,
    subdomain: input.entry.subdomain,
    subdomainUrl: input.entry.subdomainUrl,
    name: input.entry.name,
    description: `${input.project.appType} for ${input.project.targetDepartment}`,
    ownerName: input.ownerName ?? input.entry.ownerUserId,
    route: input.entry.route,
    accessStatus,
    installStatus: input.member ? "installed" : "not_installed",
    installationId: input.member
      ? `legacy_appinst_${input.entry.appId}_${input.actorId}`
      : undefined,
    installedAt: input.member?.lastAccessAt,
    myRole: input.member?.roleName,
    health: "healthy",
    version: `manifest v${input.entry.manifestVersion}`,
    lastUpdated: input.entry.publishedAt,
    primaryAction:
      accessStatus === "active"
        ? "open"
        : accessStatus === "pending"
          ? "view_status"
          : "request_access"
  };
}

export function ensureLegacyStorefrontNotifications(
  notifications: InAppNotification[],
  actorId: string,
  cards: StorefrontAppCard[]
): InAppNotification[] {
  if (!notifications.some((notification) => notification.userId === actorId)) {
    for (const card of cards) {
      notifications.push({
        id: `noti_${actorId}_${card.slug}`,
        userId: actorId,
        type: "app_published",
        title: `${card.name} is available`,
        body:
          card.accessStatus === "active"
            ? "You can open this app from My Apps."
            : "Request access from the app detail page.",
        read: false,
        createdAt: card.lastUpdated
      });
    }
  }
  return notifications.filter((notification) => notification.userId === actorId);
}

export function upsertByAppId<T extends { appId: string }>(records: T[], next: T): void {
  const existingIndex = records.findIndex((candidate) => candidate.appId === next.appId);
  if (existingIndex >= 0) records[existingIndex] = next;
  else records.push(next);
}
