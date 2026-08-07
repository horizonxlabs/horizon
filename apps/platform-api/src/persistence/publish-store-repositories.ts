import type { AppAccessRequest, AppAccessRequestStatus, AppAccessSnapshot, AppInvitation, AppInvitationStatus, AppManifest, AppMemberRecord, AppRoleDefinition, AppStoreRegistryEntry, AppUserType, CreatorTicketInboxItem, DeploymentRecord, InAppNotification, ManagedApp, PlatformProject, PlatformUser, PrdVersion, PreviewVersion, PublishChecklistItem, PublishRequestRecord, PublishResult, PublishReview, StoreAccessRequestResult, StoreAppInstallation, StorefrontAppCard, StorefrontAppDetail, StorefrontHome, SupportTicket, SupportTicketTimelineEntry, TicketPriority, TicketStatus, TicketStatusView, TicketType } from "../platform-services";
import type { WorkspaceDeployment } from "@evcp/types";
import { PermissionError, ValidationError } from "../platform-services";
import { canAccessPublishedProject, storeActionsForCard } from "./published-app-access";
import { resourceKeyForProject } from "../workspace-orchestrator/resource-ports";
import type { AppAccessRequestRecord, AppInstallationRecord, AppInvitationRecord, AppManifestRecord, AppMemberRecordData, AppRecord, AppRoleRecord, AppStoreRegistryEntryRecord, DeploymentRecordData, InAppNotificationRecord, PublishRequestRecordData, PublishStorePersistenceClient, SupportTicketRecord, SupportTicketTimelineEntryRecord, UserRecord } from "./publish-store-persistence-types";
import { matchesAccessRequest, matchesApp, matchesAppScoped, matchesInstallation, matchesTicket, slugId, slugToId, sortByDate, toIsoString, updateById } from "./publish-store-record-utils";
import { defaultUserName, defaultUserRecord } from "./publish-store-users";
export type { PublishStorePersistenceClient } from "./publish-store-persistence-types";

export class PublishStoreRepositoryBackedService {
  constructor(private readonly client: PublishStorePersistenceClient) {}

  async canAccessPublishedProject(actor: PlatformUser, projectId: string): Promise<boolean> {
    return canAccessPublishedProject(this.client, actor, projectId);
  }

  async getAppAccessSnapshot(actor: PlatformUser, input: { project: PlatformProject }): Promise<AppAccessSnapshot> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    return this.snapshot(input.project, app);
  }

  async createInvitation(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      email: string;
      roleKey: string;
      userType: AppUserType;
      expiresAt?: string;
      note?: string;
    },
  ): Promise<AppInvitation> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    await this.requireRoleKey(app.id, input.roleKey);
    const email = input.email.trim().toLowerCase();
    if (!email) throw new ValidationError("Invitation email is required");
    const isExternal = input.userType === "external";
    const existing = await this.client.appInvitation.findMany({ where: { appId: app.id } });
    const record = await this.client.appInvitation.create({
      data: {
        id: `appinv_${app.id}_${String(existing.length + 1).padStart(4, "0")}`,
        appId: app.id,
        projectId: input.project.id,
        email,
        userType: input.userType,
        roleKey: input.roleKey,
        invitedByUserId: actor.id,
        status: isExternal ? "approval_required" : "pending",
        expiresAt: input.expiresAt,
        note: input.note,
        policyWarning: isExternal ? "External invite requires approval before app access is activated." : undefined,
        createdAt: new Date(),
      },
    });
    return mapInvitation(record);
  }

  async createRole(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      key: string;
      name: string;
      description?: string;
      permissions?: string[];
    },
  ): Promise<AppRoleDefinition> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    const key = input.key.trim().toLowerCase();
    if (!key) throw new ValidationError("App role key is required");
    const role = await this.client.appRole.upsert({
      where: { appId_key: { appId: app.id, key } },
      update: {
        key,
        name: input.name.trim() || key,
        permissions: input.permissions?.length ? input.permissions : [`${input.project.id}:read`],
      },
      create: {
        id: `approle_${app.id}_${key}`,
        appId: app.id,
        key,
        name: input.name.trim() || key,
        permissions: input.permissions?.length ? input.permissions : [`${input.project.id}:read`],
      },
    });
    const mapped = (await this.rolesForApp(app.id)).find((candidate) => candidate.id === role.id);
    if (!mapped) throw new ValidationError(`Unknown app role: ${role.id}`);
    return mapped;
  }

  async createAccessRequest(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      requesterEmail: string;
      requestedRoleKey: string;
      reason: string;
    },
  ): Promise<AppAccessRequest> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    await this.requireRoleKey(app.id, input.requestedRoleKey);
    const requesterEmail = input.requesterEmail.trim().toLowerCase();
    if (!requesterEmail) throw new ValidationError("Requester email is required");
    const record = await this.createAccessRequestRecord(app, input.project.id, requesterEmail, input.requestedRoleKey, input.reason);
    return mapAccessRequest(record);
  }

  async decideAccessRequest(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      requestId: string;
      decision: "approved" | "rejected";
      decidedByUserId?: string;
    },
  ): Promise<AppAccessRequest> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    const requests = await this.client.appAccessRequest.findMany({ where: { appId: app.id } });
    const request = requests.find((candidate) => candidate.id === input.requestId);
    if (!request) throw new ValidationError(`Unknown app access request: ${input.requestId}`);
    if (request.status !== "pending") throw new ValidationError(`Access request ${input.requestId} is already ${request.status}`);
    const updated = await this.client.appAccessRequest.update({
      where: { id: request.id },
      data: {
        status: input.decision,
        decidedByUserId: input.decidedByUserId ?? actor.id,
        decidedAt: new Date(),
      },
    });
    if (input.decision === "approved") {
      await this.addMember(app, request.requesterEmail, request.requestedRoleKey, "internal", "active");
    }
    return mapAccessRequest(updated);
  }

  async getPublishReview(actor: PlatformUser, input: { project: PlatformProject; baseline: PrdVersion; preview: PreviewVersion }): Promise<PublishReview> {
    requireProjectAccess(actor, input.project);
    const app = await this.ensureApp(input.project);
    await this.ensureDefaults(input.project, app);
    const manifest = await this.buildManifest(input.project, app, input.baseline, input.preview);
    const checklist = await this.buildChecklist(input.project, manifest);
    return {
      project: input.project,
      manifest,
      checklist,
      ready: checklist.every((item) => item.status === "pass"),
    };
  }

  async publishApp(actor: PlatformUser, input: { project: PlatformProject; baseline: PrdVersion; preview: PreviewVersion; runtimeDeployment?: WorkspaceDeployment }): Promise<PublishResult> {
    requireProjectAccess(actor, input.project);
    const review = await this.getPublishReview(actor, input);
    if (input.runtimeDeployment) {
      review.manifest.runtime = {
        deploymentRevisionId: input.runtimeDeployment.id,
        revision: input.runtimeDeployment.revision,
        sourceCommitSha: input.runtimeDeployment.commitSha,
        imageTag: input.runtimeDeployment.imageTag,
        imageDigest: input.runtimeDeployment.imageDigest
      };
      review.manifest.app.route = `/api/apps/${input.runtimeDeployment.slug}`;
      review.manifest.frontend.routes = [review.manifest.app.route];
    }
    const blockingItems = review.checklist.filter((item) => item.status === "fail").map((item) => item.label);
    const publishCount = (await this.client.publishRequest.findMany({ where: { projectId: input.project.id } })).length;
    const now = new Date();
    const publishRequest = await this.client.publishRequest.create({
      data: {
        id: `pubreq_${review.manifest.app.slug}_${String(publishCount + 1).padStart(4, "0")}`,
        projectId: input.project.id,
        appId: review.manifest.appId,
        status: blockingItems.length > 0 ? "blocked" : "published",
        requestedByUserId: actor.id,
        manifestVersion: review.manifest.manifestVersion,
        blockingItems,
        createdAt: now,
        publishedAt: blockingItems.length > 0 ? null : now,
      },
    });
    if (blockingItems.length > 0) throw new ValidationError(`Publish blocked: ${blockingItems.join(", ")}`);

    await this.client.appManifest.upsert({
      where: { appId: review.manifest.appId },
      update: manifestRecord(review.manifest),
      create: manifestRecord(review.manifest),
    });
    await this.client.app.update({
      where: { id: review.manifest.appId },
      data: { status: "published" },
    });

    const deploymentCount = (await this.client.deploymentRecord.findMany({ where: { projectId: input.project.id } })).length;
    const deployment = await this.client.deploymentRecord.create({
      data: {
        id: `dep_${slugToId(review.manifest.app.slug)}_${String(deploymentCount + 1).padStart(3, "0")}`,
        projectId: input.project.id,
        appId: review.manifest.appId,
        publishRequestId: publishRequest.id,
        status: "published",
        environment: "app_store",
        route: review.manifest.app.route,
        manifestVersion: review.manifest.manifestVersion,
        prdVersion: review.manifest.prd.version,
        frontendCheckpointId: review.manifest.frontend.checkpointId,
        publishedByUserId: actor.id,
        deploymentRevisionId: input.runtimeDeployment?.id,
        runtimeRevision: input.runtimeDeployment?.revision,
        sourceCommitSha: input.runtimeDeployment?.commitSha,
        imageTag: input.runtimeDeployment?.imageTag,
        imageDigest: input.runtimeDeployment?.imageDigest,
        containerName: input.runtimeDeployment?.containerName,
        publishedAt: now
      }
    });
    const registryEntry = await this.client.appStoreRegistryEntry.upsert({
      where: { appId: review.manifest.appId },
      update: {
        deploymentRecordId: deployment.id,
        slug: review.manifest.app.slug,
        name: review.manifest.app.name,
        route: review.manifest.app.route,
        status: "published",
        visibility: "restricted",
        accessMode: "membership_or_invite",
        roleKeys: review.manifest.roles.map((role) => role.key),
        ownerUserId: input.project.ownerUserId,
        manifestVersion: review.manifest.manifestVersion,
        publishedAt: now,
      },
      create: {
        id: `store_${review.manifest.app.slug}`,
        appId: review.manifest.appId,
        projectId: input.project.id,
        deploymentRecordId: deployment.id,
        slug: review.manifest.app.slug,
        name: review.manifest.app.name,
        route: review.manifest.app.route,
        status: "published",
        visibility: "restricted",
        accessMode: "membership_or_invite",
        roleKeys: review.manifest.roles.map((role) => role.key),
        ownerUserId: input.project.ownerUserId,
        manifestVersion: review.manifest.manifestVersion,
        publishedAt: now,
      },
    });

    return {
      publishRequest: mapPublishRequest(publishRequest),
      deployment: mapDeployment(deployment),
      registryEntry: mapRegistry(registryEntry),
      manifest: review.manifest,
    };
  }

  async listRegistry(actor: PlatformUser): Promise<AppStoreRegistryEntry[]> {
    requireAnyRole(actor, ["admin", "creator", "end_user"]);
    const records = await this.client.appStoreRegistryEntry.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "asc" },
    });
    return records.map(mapRegistry);
  }

  async listStoreApps(actor: PlatformUser): Promise<StorefrontHome> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const cards = await Promise.all((await this.listRegistry(actor)).map((entry) => this.toCard(actor, entry)));
    const notifications = await this.ensureNotifications(actor, cards);
    return {
      profile: {
        userName: actor.name,
        email: actor.email,
      },
      myApps: cards.filter((card) => card.installStatus === "installed"),
      availableApps: cards.filter((card) => card.installStatus !== "installed"),
      notifications,
    };
  }

  async getStoreAppDetail(actor: PlatformUser, appSlug: string): Promise<StorefrontAppDetail> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const entry = await this.requireRegistryEntry(appSlug);
    const card = await this.toCard(actor, entry);
    return {
      ...card,
      ownerUserId: entry.ownerUserId,
      ownerName: defaultUserName(entry.ownerUserId, entry.ownerUserId),
      department: "Horizon workspace",
      accessMode: entry.accessMode, availableRoles: [...entry.roleKeys],
      releaseNotes: [`Published as manifest v${entry.manifestVersion}`, "Managed through the Horizon publish and registry workflow"],
      supportContact: "App owner",
      actions: storeActionsForCard(card),
    };
  }

  async installStoreApp(actor: PlatformUser, input: { appSlug: string }): Promise<StoreAppInstallation> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const entry = await this.requireRegistryEntry(input.appSlug);
    const member = await this.getMemberForEmail(entry.appId, actor.email);
    if (!member) throw new PermissionError(`App ${input.appSlug} requires active access before install`);
    const existing = await this.client.appInstallation.findFirst({
      where: { appId: entry.appId, userId: actor.id },
    });
    const now = new Date();
    const record = await this.client.appInstallation.upsert({
      where: { appId_userId: { appId: entry.appId, userId: actor.id } },
      update: {
        status: "active",
        disabledAt: null,
        lastOpenedAt: now,
      },
      create: {
        id: `appinst_${entry.appId}_${actor.id}`,
        appId: entry.appId,
        userId: actor.id,
        status: "active",
        installedAt: existing?.installedAt ?? now,
        disabledAt: null,
        lastOpenedAt: now,
      },
    });
    return mapInstallation(record, entry, actor);
  }

  async uninstallStoreApp(actor: PlatformUser, input: { appSlug: string }): Promise<StoreAppInstallation> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const entry = await this.requireRegistryEntry(input.appSlug);
    const existing = await this.client.appInstallation.findFirst({
      where: { appId: entry.appId, userId: actor.id },
    });
    if (!existing || existing.status !== "active") throw new ValidationError(`App ${input.appSlug} is not installed`);
    const record = await this.client.appInstallation.update({
      where: { id: existing.id },
      data: {
        status: "disabled",
        disabledAt: new Date(),
      },
    });
    return mapInstallation(record, entry, actor);
  }

  async requestStoreAccess(actor: PlatformUser, input: { appSlug: string; requestedRoleKey: string; reason: string; department?: string }): Promise<StoreAccessRequestResult> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const entry = await this.requireRegistryEntry(input.appSlug);
    const app = await this.ensureApp({
      id: entry.projectId,
      name: entry.name,
      status: "published",
      ownerUserId: entry.ownerUserId,
      appType: "Workflow App",
      businessProblem: "",
      targetDepartment: "HR Department",
      intendedUsers: [],
      dataSensitivity: "internal",
      appId: entry.appId,
      createdAt: entry.publishedAt,
    });
    await this.requireRoleKey(app.id, input.requestedRoleKey);
    const existing = (
      await this.client.appAccessRequest.findMany({
        where: {
          appId: app.id,
          requesterEmail: actor.email,
          requestedRoleKey: input.requestedRoleKey,
          status: "pending",
        },
      })
    )[0];
    const record = existing ?? (await this.createAccessRequestRecord(app, entry.projectId, actor.email, input.requestedRoleKey, input.reason));
    return {
      id: record.id,
      appSlug: entry.slug,
      requestedRoleKey: record.requestedRoleKey,
      requesterEmail: record.requesterEmail,
      status: "pending",
      reason: record.reason,
      department: input.department,
      createdAt: toIsoString(record.createdAt),
    };
  }

  async createTicket(
    actor: PlatformUser,
    input: {
      appSlug: string;
      type: TicketType;
      priority: TicketPriority;
      title: string;
      description: string;
      deviceInfo: string;
      screenshotUrl?: string;
    },
  ): Promise<SupportTicket> {
    requireAnyRole(actor, ["end_user", "creator", "admin"]);
    const detail = await this.canSubmitTicket(actor, input.appSlug);
    if (!input.title.trim()) throw new ValidationError("Ticket title is required");
    if (!input.description.trim()) throw new ValidationError("Ticket description is required");
    const existing = await this.client.supportTicket.findMany();
    const now = new Date();
    const id = `ticket_${String(existing.length + 1).padStart(4, "0")}`;
    const timeline = {
      id: `${id}_tl_001`,
      ticketId: id,
      status: "submitted",
      label: "Ticket submitted",
      actorUserId: actor.id,
      occurredAt: now,
    };
    const ticket = await this.client.supportTicket.create({
      data: {
        id,
        ticketNumber: `TKT-${String(existing.length + 1).padStart(4, "0")}`,
        appId: detail.appId,
        appSlug: input.appSlug,
        projectId: detail.projectId,
        submittedByUserId: actor.id,
        submittedByEmail: actor.email,
        type: input.type,
        priority: input.priority,
        title: input.title.trim(),
        description: input.description.trim(),
        deviceInfo: input.deviceInfo.trim() || "Unknown device",
        screenshotUrl: input.screenshotUrl,
        status: "submitted",
        assignedToUserId: detail.ownerUserId,
        createdAt: now,
        updatedAt: now,
        timeline: [timeline],
      },
    });
    await this.client.supportTicketTimelineEntry.create({ data: timeline });
    return mapTicket({ ...ticket, timeline: [timeline] });
  }

  async getTicketStatus(actor: PlatformUser, ticketId: string): Promise<TicketStatusView> {
    const ticket = await this.requireTicket(ticketId);
    if (actor.role !== "creator" && actor.role !== "admin" && ticket.submittedByUserId !== actor.id) {
      throw new PermissionError(`User ${actor.email} cannot access ticket ${ticketId}`);
    }
    const detail = await this.getStoreAppDetail({ ...actor, role: "end_user", email: ticket.submittedByEmail }, ticket.appSlug);
    return { ...ticket, appName: detail.name };
  }

  async listCreatorInbox(actor: PlatformUser, projectId: string): Promise<CreatorTicketInboxItem[]> {
    requireAnyRole(actor, ["admin", "creator"]);
    const tickets = await this.client.supportTicket.findMany({
      where: { projectId },
      include: { timeline: true },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(
      tickets.map(async (ticket) => {
        const mapped = mapTicket(ticket);
        const detail = await this.getStoreAppDetail({ ...actor, role: "end_user", email: mapped.submittedByEmail }, mapped.appSlug);
        return {
          ...mapped,
          appName: detail.name,
          actions: ["reply", "convert_to_prd_change", "convert_to_ai_prompt", "resolve"],
        };
      }),
    );
  }

  async getLatestDeploymentForProject(actor: PlatformUser, project: PlatformProject): Promise<DeploymentRecord> {
    requireProjectAccess(actor, project);
    const deployments = await this.client.deploymentRecord.findMany({
      where: { projectId: project.id },
      orderBy: { publishedAt: "asc" },
    });
    const deployment = deployments.at(-1);
    if (!deployment) throw new ValidationError(`No deployment record for project ${project.id}`);
    return mapDeployment(deployment);
  }

  async getManifestForProject(actor: PlatformUser, project: PlatformProject): Promise<AppManifest> {
    requireProjectAccess(actor, project);
    const manifest = await this.client.appManifest.findFirst({ where: { projectId: project.id } });
    if (!manifest) throw new ValidationError(`No app manifest for project ${project.id}`);
    return mapManifest(manifest);
  }

  private async canSubmitTicket(actor: PlatformUser, appSlug: string): Promise<StorefrontAppDetail> {
    const detail = await this.getStoreAppDetail(actor, appSlug);
    if (detail.accessStatus !== "active") throw new PermissionError(`App ${appSlug} is not visible for ticket submission`);
    return detail;
  }

  private async snapshot(project: PlatformProject, app: ManagedApp): Promise<AppAccessSnapshot> {
    const roles = await this.rolesForApp(app.id);
    const members = await this.membersForApp(app.id);
    const invitations = await this.client.appInvitation.findMany({
      where: { appId: app.id },
      orderBy: { createdAt: "asc" },
    });
    const accessRequests = await this.client.appAccessRequest.findMany({
      where: { appId: app.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      project,
      app,
      roles,
      members,
      invitations: invitations.map(mapInvitation),
      accessRequests: accessRequests.map(mapAccessRequest),
    };
  }

  private async ensureApp(project: PlatformProject): Promise<ManagedApp> {
    const id = project.appId ?? `app_${slugToId(project.id)}`;
    const record = await this.client.app.upsert({
      where: { id },
      update: {
        slug: id,
        name: project.name,
        projectId: project.id,
        databaseSchemaName: `app_${slugToId(project.id)}`,
      },
      create: {
        id,
        slug: id,
        name: project.name,
        status: project.status === "published" ? "published" : "draft",
        projectId: project.id,
        databaseSchemaName: `app_${slugToId(project.id)}`,
      },
    });
    return mapApp(record);
  }

  private async ensureDefaults(project: PlatformProject, app: ManagedApp): Promise<void> {
    const roles = await this.client.appRole.findMany({ where: { appId: app.id } });
    if (roles.length === 0) {
      for (const role of defaultRoles(project.id)) {
        await this.client.appRole.upsert({
          where: { appId_key: { appId: app.id, key: role.key } },
          update: role,
          create: {
            ...role,
            id: `approle_${app.id}_${role.key}`,
            appId: app.id,
          },
        });
      }
    }

    const members = await this.client.appMember.findMany({
      where: { appId: app.id },
      include: { user: true, role: true },
    });
    if (members.length === 0) {
      await this.addMember(app, "creator@company.com", "hr_admin", "internal", "active", project.ownerUserId);
    }

    if ((await this.client.appInvitation.findMany({ where: { appId: app.id } })).length === 0) {
      await this.client.appInvitation.create({
        data: {
          id: `appinv_${app.id}_seed_internal`,
          appId: app.id,
          projectId: project.id,
          email: "manager@company.com",
          userType: "internal",
          roleKey: "manager",
          invitedByUserId: project.ownerUserId,
          status: "pending",
          note: "Join manager approval queue",
          createdAt: new Date("2026-08-17T09:00:00.000Z"),
        },
      });
    }

    if ((await this.client.appAccessRequest.findMany({ where: { appId: app.id } })).length === 0) {
      await this.client.appAccessRequest.create({
        data: {
          id: `appreq_${app.id}_seed_manager`,
          appId: app.id,
          projectId: project.id,
          requesterEmail: "manager@company.com",
          requestedRoleKey: "manager",
          reason: "Needs approval queue access",
          status: "pending",
          createdAt: new Date("2026-08-17T10:00:00.000Z"),
        },
      });
    }
  }

  private async buildManifest(project: PlatformProject, app: ManagedApp, baseline: PrdVersion, preview: PreviewVersion): Promise<AppManifest> {
    const roles = await this.rolesForApp(app.id);
    const priorManifest = await this.client.appManifest.findFirst({ where: { appId: app.id } });
    const manifestVersion = String((Number.parseInt(priorManifest?.manifestVersion ?? "0", 10) || 0) + 1);
    const route = `/api/apps/${resourceKeyForProject(project.id)}`;
    return {
      id: `manifest_${app.id}_v${manifestVersion}`,
      appId: app.id,
      projectId: project.id,
      manifestVersion,
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        route,
        status: app.status
      },
      prd: {
        versionId: baseline.isBaseline ? baseline.id : "",
        version: baseline.isBaseline ? baseline.version : "",
      },
      frontend: {
        checkpointId: preview.version === "preview-0000" ? "" : preview.id,
        version: preview.version === "preview-0000" ? "" : preview.version,
        checksum: `sha256:${slugToId(preview.id).padEnd(16, "0")}`,
        routes: [route]
      },
      auth: {
        mode: "platform_auth_sdk",
        accessMode: "restricted",
      },
      roles: roles.map((role) => ({
        key: role.key,
        name: role.name,
        permissions: [...role.permissions],
      })),
      database: {
        schemaName: `app_${slugToId(project.id)}`,
        tables: ["leave_requests", "approval_steps", "leave_balances"],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async buildChecklist(project: PlatformProject, manifest: AppManifest): Promise<PublishChecklistItem[]> {
    const members = await this.membersForApp(manifest.appId);
    return [
      {
        key: "prd_baseline",
        label: "PRD baseline",
        status: manifest.prd.versionId ? "pass" : "fail",
        detail: manifest.prd.versionId ? `Baseline ${manifest.prd.version}` : "Confirm PRD baseline before publishing",
      },
      {
        key: "active_frontend",
        label: "Active frontend checkpoint",
        status: manifest.frontend.checkpointId && manifest.frontend.version ? "pass" : "fail",
        detail: manifest.frontend.checkpointId ? manifest.frontend.version : "Generate or restore an active frontend checkpoint",
      },
      {
        key: "app_roles",
        label: "App roles",
        status: manifest.roles.length > 0 ? "pass" : "fail",
        detail: manifest.roles.length > 0 ? `${manifest.roles.length} roles configured` : "Create at least one app role",
      },
      {
        key: "app_owner",
        label: "At least one owner",
        status: project.ownerUserId || members.some((member) => member.roleKey === "hr_admin") ? "pass" : "fail",
        detail: project.ownerUserId ? `Owner ${project.ownerUserId}` : "Assign an owner before publishing",
      },
      {
        key: "blocking_guardrail",
        label: "No blocking guardrail event",
        status: "pass",
        detail: "No blocking guardrail event is attached to this publish review",
      },
    ];
  }

  private async rolesForApp(appId: string): Promise<AppRoleDefinition[]> {
    const roles = await this.client.appRole.findMany({ where: { appId } });
    const members = await this.client.appMember.findMany({
      where: { appId },
      include: { user: true, role: true },
    });
    return roles.map((role) => ({
      id: role.id,
      appId: role.appId,
      key: role.key,
      name: role.name,
      description: defaultRoleDescription(role.key),
      permissions: [...role.permissions],
      memberCount: members.filter((member) => member.roleId === role.id).length,
    }));
  }

  private async membersForApp(appId: string): Promise<AppMemberRecord[]> {
    const records = await this.client.appMember.findMany({
      where: { appId },
      include: { user: true, role: true },
    });
    return records.map(mapMember);
  }

  private async getMemberForEmail(appId: string, email: string): Promise<AppMemberRecord | undefined> {
    return (await this.membersForApp(appId)).find((member) => member.email === email && member.status === "active");
  }

  private async getPendingRequestForEmail(appId: string, email: string, roleKey?: string): Promise<AppAccessRequest | undefined> {
    const requests = await this.client.appAccessRequest.findMany({
      where: { appId, requesterEmail: email, status: "pending", requestedRoleKey: roleKey },
    });
    return requests[0] ? mapAccessRequest(requests[0]) : undefined;
  }

  private async requireRoleKey(appId: string, roleKey: string): Promise<AppRoleDefinition> {
    const role = (await this.rolesForApp(appId)).find((candidate) => candidate.key === roleKey);
    if (!role) throw new ValidationError(`Unknown app role: ${roleKey}`);
    return role;
  }

  private async addMember(app: ManagedApp, email: string, roleKey: string, userType: AppUserType, status: AppMemberRecord["status"], userId = slugId("usr", email)): Promise<AppMemberRecord> {
    const role = await this.requireRoleKey(app.id, roleKey);
    const existing = (await this.membersForApp(app.id)).find((member) => member.email === email && member.roleKey === roleKey);
    if (existing) return existing;
    const user = await this.client.platformUser.findUnique({ where: { id: userId } })
      ?? await this.client.platformUser.findUnique({ where: { email } });
    if (!user) throw new ValidationError(`Platform user must sign in before app access can be approved: ${email}`);
    await this.client.appMember.create({
      data: { appId: app.id, userId: user.id, roleId: role.id },
    });
    return {
      id: `appmem_${app.id}_${user.id}_${role.id}`,
      appId: app.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      userType,
      roleId: role.id,
      roleKey: role.key,
      roleName: role.name,
      status,
      lastAccessAt: status === "active" ? new Date("2026-08-20T09:00:00.000Z").toISOString() : undefined,
    };
  }

  private async createAccessRequestRecord(app: ManagedApp, projectId: string, requesterEmail: string, requestedRoleKey: string, reason: string): Promise<AppAccessRequestRecord> {
    const existing = await this.client.appAccessRequest.findMany({ where: { appId: app.id } });
    return this.client.appAccessRequest.create({
      data: {
        id: `appreq_${app.id}_${String(existing.length + 1).padStart(4, "0")}`,
        appId: app.id,
        projectId,
        requesterEmail,
        requestedRoleKey,
        reason: reason.trim() || "Access requested from App Store",
        status: "pending",
        createdAt: new Date(),
      },
    });
  }

  private async requireRegistryEntry(appSlug: string): Promise<AppStoreRegistryEntry> {
    const entry = await this.client.appStoreRegistryEntry.findFirst({ where: { slug: appSlug } });
    if (!entry) throw new PermissionError(`Unknown app or app is not visible: ${appSlug}`);
    return mapRegistry(entry);
  }

  private async requireTicket(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.client.supportTicket.findUnique({
      where: { id: ticketId },
      include: { timeline: true },
    });
    if (!ticket) throw new ValidationError(`Unknown ticket: ${ticketId}`);
    return mapTicket(ticket);
  }

  private async toCard(actor: PlatformUser, entry: AppStoreRegistryEntry): Promise<StorefrontAppCard> {
    const member = await this.getMemberForEmail(entry.appId, actor.email);
    const pending = await this.getPendingRequestForEmail(entry.appId, actor.email);
    const installation = await this.client.appInstallation.findFirst({
      where: { appId: entry.appId, userId: actor.id },
    });
    const accessStatus = member ? "active" : pending ? "pending" : "available";
    const installStatus = installation?.status === "active" ? "installed" : installation ? "disabled" : "not_installed";
    return {
      id: entry.id,
      appId: entry.appId,
      projectId: entry.projectId,
      slug: entry.slug,
      name: entry.name,
      description: `${entry.name} is published and governed through Horizon.`,
      ownerName: defaultUserName(entry.ownerUserId, entry.ownerUserId),
      route: entry.route,
      accessStatus,
      installStatus,
      installationId: installation?.id,
      installedAt: installation ? toIsoString(installation.installedAt) : undefined,
      myRole: member?.roleName,
      health: "healthy",
      version: `manifest v${entry.manifestVersion}`,
      lastUpdated: entry.publishedAt,
      primaryAction: installStatus === "installed" ? "open" : accessStatus === "active" ? "install" : accessStatus === "pending" ? "view_status" : "request_access",
    };
  }

  private async ensureNotifications(actor: PlatformUser, cards: StorefrontAppCard[]): Promise<InAppNotification[]> {
    const existing = await this.client.inAppNotification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "asc" },
    });
    if (existing.length === 0) {
      for (const card of cards) {
        await this.client.inAppNotification.create({
          data: {
            id: `noti_${actor.id}_${card.slug}`,
            userId: actor.id,
            projectId: card.projectId,
            type: "app_published",
            title: `${card.name} is available`,
            body: card.accessStatus === "active" ? "You can open this app from My Apps." : "Request access from the app detail page.",
            read: false,
            createdAt: card.lastUpdated,
          },
        });
      }
    }
    return (
      await this.client.inAppNotification.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: "asc" },
      })
    ).map(mapNotification);
  }
}
export class MemoryPublishStorePersistenceClient implements PublishStorePersistenceClient {
  readonly platformUser: PublishStorePersistenceClient["platformUser"];
  readonly app: PublishStorePersistenceClient["app"];
  readonly appRole: PublishStorePersistenceClient["appRole"];
  readonly appMember: PublishStorePersistenceClient["appMember"];
  readonly appInstallation: PublishStorePersistenceClient["appInstallation"];
  readonly appInvitation: PublishStorePersistenceClient["appInvitation"];
  readonly appAccessRequest: PublishStorePersistenceClient["appAccessRequest"];
  readonly appManifest: PublishStorePersistenceClient["appManifest"];
  readonly publishRequest: PublishStorePersistenceClient["publishRequest"];
  readonly deploymentRecord: PublishStorePersistenceClient["deploymentRecord"];
  readonly appStoreRegistryEntry: PublishStorePersistenceClient["appStoreRegistryEntry"];
  readonly supportTicket: PublishStorePersistenceClient["supportTicket"];
  readonly supportTicketTimelineEntry: PublishStorePersistenceClient["supportTicketTimelineEntry"];
  readonly inAppNotification: PublishStorePersistenceClient["inAppNotification"];

  private readonly apps: AppRecord[] = [];
  private readonly roles: AppRoleRecord[] = [];
  private readonly members: AppMemberRecordData[] = [];
  private readonly installations: AppInstallationRecord[] = [];
  private readonly invitations: AppInvitationRecord[] = [];
  private readonly accessRequests: AppAccessRequestRecord[] = [];
  private readonly manifests: AppManifestRecord[] = [];
  private readonly publishRequests: PublishRequestRecordData[] = [];
  private readonly deployments: DeploymentRecordData[] = [];
  private readonly registry: AppStoreRegistryEntryRecord[] = [];
  private readonly tickets: SupportTicketRecord[] = [];
  private readonly ticketTimeline: SupportTicketTimelineEntryRecord[] = [];
  private readonly notifications: InAppNotificationRecord[] = [];
  private readonly users: UserRecord[] = [];

  constructor(
    seed: Partial<{
      apps: AppRecord[];
      roles: AppRoleRecord[];
      members: AppMemberRecordData[];
      installations: AppInstallationRecord[];
      invitations: AppInvitationRecord[];
      accessRequests: AppAccessRequestRecord[];
      manifests: AppManifestRecord[];
      publishRequests: PublishRequestRecordData[];
      deployments: DeploymentRecordData[];
      registry: AppStoreRegistryEntryRecord[];
      tickets: SupportTicketRecord[];
      ticketTimeline: SupportTicketTimelineEntryRecord[];
      notifications: InAppNotificationRecord[];
      users: UserRecord[];
    }> = {},
  ) {
    this.apps = seed.apps ?? [];
    this.roles = seed.roles ?? [];
    this.members = seed.members ?? [];
    this.installations = seed.installations ?? [];
    this.invitations = seed.invitations ?? [];
    this.accessRequests = seed.accessRequests ?? [];
    this.manifests = seed.manifests ?? [];
    this.publishRequests = seed.publishRequests ?? [];
    this.deployments = seed.deployments ?? [];
    this.registry = seed.registry ?? [];
    this.tickets = seed.tickets ?? [];
    this.ticketTimeline = seed.ticketTimeline ?? [];
    this.notifications = seed.notifications ?? [];
    this.users = seed.users ?? [defaultUserRecord("usr_creator"), defaultUserRecord("usr_end_user")];

    this.platformUser = {
      findUnique: async ({ where }) =>
        this.users.find((user) =>
          (where.id !== undefined && user.id === where.id)
          || (where.email !== undefined && user.email === where.email)
        ) ?? null,
    };

    this.app = {
      findFirst: async ({ where }) => this.apps.find((app) => matchesApp(app, where)) ?? null,
      upsert: async ({ where, update, create }) => {
        const index = this.apps.findIndex((app) => app.id === where.id);
        if (index >= 0) {
          const next = { ...this.apps[index], ...update };
          this.apps[index] = next;
          return next;
        }
        this.apps.push(create);
        return create;
      },
      update: async ({ where, data }) => updateById(this.apps, where.id, data, "app"),
    };
    this.appRole = {
      findMany: async ({ where }) => this.roles.filter((role) => role.appId === where.appId),
      upsert: async ({ where, update, create }) => {
        const index = this.roles.findIndex((role) => role.appId === where.appId_key.appId && role.key === where.appId_key.key);
        if (index >= 0) {
          const next = { ...this.roles[index], ...update };
          this.roles[index] = next;
          return next;
        }
        this.roles.push(create);
        return create;
      },
    };
    this.appMember = {
      findMany: async ({ where }) => this.members.filter((member) => member.appId === where.appId).map((member) => this.withMemberRelations(member)),
      create: async ({ data }) => {
        const member = {
          ...data,
          user: this.users.find((user) => user.id === data.userId) ?? defaultUserRecord(data.userId),
          role: this.roles.find((role) => role.id === data.roleId),
        };
        this.members.push(member);
        return this.withMemberRelations(member);
      },
    };
    this.appInstallation = {
      findFirst: async ({ where }) => this.installations.find((installation) => matchesInstallation(installation, where)) ?? null,
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.installations.filter((installation) => matchesInstallation(installation, where)),
          "installedAt",
          orderBy?.installedAt,
        ),
      upsert: async ({ where, update, create }) => {
        const index = this.installations.findIndex((installation) => installation.appId === where.appId_userId.appId && installation.userId === where.appId_userId.userId);
        if (index >= 0) {
          const next = { ...this.installations[index], ...update };
          this.installations[index] = next;
          return next;
        }
        this.installations.push(create);
        return create;
      },
      update: async ({ where, data }) => updateById(this.installations, where.id, data, "app installation"),
    };
    this.appInvitation = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.invitations.filter((invitation) => matchesAppScoped(invitation, where)),
          "createdAt",
          orderBy?.createdAt,
        ),
      create: async ({ data }) => {
        this.invitations.push(data);
        return data;
      },
    };
    this.appAccessRequest = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.accessRequests.filter((request) => matchesAccessRequest(request, where)),
          "createdAt",
          orderBy?.createdAt,
        ),
      create: async ({ data }) => {
        this.accessRequests.push(data);
        return data;
      },
      update: async ({ where, data }) => updateById(this.accessRequests, where.id, data, "app access request"),
    };
    this.appManifest = {
      findFirst: async ({ where }) => this.manifests.find((manifest) => (!where.projectId || manifest.projectId === where.projectId) && (!where.appId || manifest.appId === where.appId)) ?? null,
      upsert: async ({ where, update, create }) => {
        const index = this.manifests.findIndex((manifest) => manifest.appId === where.appId);
        if (index >= 0) {
          const next = { ...this.manifests[index], ...update };
          this.manifests[index] = next;
          return next;
        }
        this.manifests.push(create);
        return create;
      },
    };
    this.publishRequest = {
      findMany: async (args = {}) =>
        sortByDate(
          this.publishRequests.filter((record) => matchesAppScoped(record, args.where ?? {})),
          "createdAt",
          args.orderBy?.createdAt,
        ),
      create: async ({ data }) => {
        this.publishRequests.push(data);
        return data;
      },
    };
    this.deploymentRecord = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.deployments.filter((record) => matchesAppScoped(record, where)),
          "publishedAt",
          orderBy?.publishedAt,
        ),
      create: async ({ data }) => {
        this.deployments.push(data);
        return data;
      },
    };
    this.appStoreRegistryEntry = {
      findMany: async (args = {}) =>
        sortByDate(
          this.registry.filter((entry) => !args.where?.status || entry.status === args.where.status),
          "publishedAt",
          args.orderBy?.publishedAt,
        ),
      findFirst: async ({ where }) => this.registry.find((entry) => (!where.slug || entry.slug === where.slug) && (!where.projectId || entry.projectId === where.projectId) && (!where.appId || entry.appId === where.appId)) ?? null,
      upsert: async ({ where, update, create }) => {
        const index = this.registry.findIndex((entry) => entry.appId === where.appId);
        if (index >= 0) {
          const next = { ...this.registry[index], ...update };
          this.registry[index] = next;
          return next;
        }
        this.registry.push(create);
        return create;
      },
    };
    this.supportTicket = {
      findUnique: async ({ where }) => {
        const ticket = this.tickets.find((candidate) => candidate.id === where.id);
        return ticket ? this.withTicketTimeline(ticket) : null;
      },
      findMany: async (args = {}) =>
        sortByDate(
          this.tickets.filter((ticket) => matchesTicket(ticket, args.where ?? {})),
          "createdAt",
          args.orderBy?.createdAt,
        ).map((ticket) => this.withTicketTimeline(ticket)),
      create: async ({ data }) => {
        const { timeline, ...ticket } = data;
        this.tickets.push(ticket);
        if (timeline) this.ticketTimeline.push(...timeline);
        return this.withTicketTimeline(ticket);
      },
    };
    this.supportTicketTimelineEntry = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.ticketTimeline.filter((entry) => entry.ticketId === where.ticketId),
          "occurredAt",
          orderBy?.occurredAt,
        ),
      create: async ({ data }) => {
        if (!this.ticketTimeline.some((entry) => entry.id === data.id)) this.ticketTimeline.push(data);
        return data;
      },
    };
    this.inAppNotification = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.notifications.filter((notification) => notification.userId === where.userId),
          "createdAt",
          orderBy?.createdAt,
        ),
      create: async ({ data }) => {
        this.notifications.push(data);
        return data;
      },
    };
  }

  private withMemberRelations(member: AppMemberRecordData): AppMemberRecordData {
    return {
      ...member,
      user: member.user ?? defaultUserRecord(member.userId),
      role: member.role ?? this.roles.find((role) => role.id === member.roleId),
    };
  }

  private withTicketTimeline(ticket: Omit<SupportTicketRecord, "timeline">): SupportTicketRecord {
    return {
      ...ticket,
      timeline: this.ticketTimeline.filter((entry) => entry.ticketId === ticket.id).sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()),
    };
  }
}

export function createPublishStoreRepositoryBackedService(client: PublishStorePersistenceClient = new MemoryPublishStorePersistenceClient()): PublishStoreRepositoryBackedService {
  return new PublishStoreRepositoryBackedService(client);
}

export async function createPrismaPublishStorePersistence(databaseUrl = process.env.DATABASE_URL): Promise<{
  client: PublishStorePersistenceClient;
  service: PublishStoreRepositoryBackedService;
}> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as PublishStorePersistenceClient;
  return {
    client,
    service: new PublishStoreRepositoryBackedService(client),
  };
}

function mapApp(record: AppRecord): ManagedApp {
  return {
    id: record.id,
    projectId: record.projectId,
    slug: record.slug,
    name: record.name,
    status: normalizeAppStatus(record.status),
    route: `/apps/${record.slug}`,
  };
}

function mapMember(record: AppMemberRecordData): AppMemberRecord {
  const role = record.role;
  const user = record.user ?? defaultUserRecord(record.userId);
  return {
    id: `appmem_${record.appId}_${record.userId}_${record.roleId}`,
    appId: record.appId,
    userId: record.userId,
    email: user.email,
    name: user.name,
    userType: normalizeUserType(record.userType),
    roleId: record.roleId,
    roleKey: role?.key ?? "employee",
    roleName: role?.name ?? "Employee",
    status: normalizeMemberStatus(record.status),
    lastAccessAt: record.lastAccessAt ? toIsoString(record.lastAccessAt) : new Date("2026-08-20T09:00:00.000Z").toISOString(),
  };
}

function mapInvitation(record: AppInvitationRecord): AppInvitation {
  return {
    id: record.id,
    appId: record.appId,
    projectId: record.projectId,
    email: record.email,
    userType: normalizeUserType(record.userType),
    roleKey: record.roleKey,
    invitedByUserId: record.invitedByUserId,
    status: normalizeInvitationStatus(record.status),
    expiresAt: record.expiresAt ? toIsoString(record.expiresAt) : undefined,
    note: record.note ?? undefined,
    policyWarning: record.policyWarning ?? undefined,
    createdAt: toIsoString(record.createdAt),
  };
}

function mapAccessRequest(record: AppAccessRequestRecord): AppAccessRequest {
  return {
    id: record.id,
    appId: record.appId,
    projectId: record.projectId,
    requesterEmail: record.requesterEmail,
    requestedRoleKey: record.requestedRoleKey,
    reason: record.reason,
    status: normalizeAccessRequestStatus(record.status),
    decidedByUserId: record.decidedByUserId ?? undefined,
    decidedAt: record.decidedAt ? toIsoString(record.decidedAt) : undefined,
    createdAt: toIsoString(record.createdAt),
  };
}

function mapInstallation(record: AppInstallationRecord, entry: AppStoreRegistryEntry, actor: PlatformUser): StoreAppInstallation {
  return {
    id: record.id,
    appId: record.appId,
    appSlug: entry.slug,
    projectId: entry.projectId,
    userId: record.userId,
    userEmail: actor.email,
    status: record.status === "disabled" ? "disabled" : "active",
    installedAt: toIsoString(record.installedAt),
    disabledAt: record.disabledAt ? toIsoString(record.disabledAt) : undefined,
    lastOpenedAt: record.lastOpenedAt ? toIsoString(record.lastOpenedAt) : undefined,
  };
}

function mapPublishRequest(record: PublishRequestRecordData): PublishRequestRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    appId: record.appId,
    status: record.status === "published" ? "published" : "blocked",
    requestedByUserId: record.requestedByUserId,
    manifestVersion: record.manifestVersion,
    blockingItems: Array.isArray(record.blockingItems) ? record.blockingItems.map(String) : [],
    createdAt: toIsoString(record.createdAt),
    publishedAt: record.publishedAt ? toIsoString(record.publishedAt) : undefined,
  };
}

function mapDeployment(record: DeploymentRecordData): DeploymentRecord {
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
    publishedAt: toIsoString(record.publishedAt)
  };
}

function mapRegistry(record: AppStoreRegistryEntryRecord): AppStoreRegistryEntry {
  return {
    id: record.id,
    appId: record.appId,
    projectId: record.projectId,
    slug: record.slug,
    name: record.name,
    route: record.route,
    status: "published",
    visibility: "restricted",
    accessMode: "membership_or_invite",
    roleKeys: [...record.roleKeys],
    ownerUserId: record.ownerUserId,
    deploymentId: record.deploymentRecordId,
    manifestVersion: record.manifestVersion,
    publishedAt: toIsoString(record.publishedAt),
  };
}

function mapManifest(record: AppManifestRecord): AppManifest {
  if (record.manifest && typeof record.manifest === "object") return record.manifest as AppManifest;
  return {
    id: record.id,
    appId: record.appId,
    projectId: record.projectId,
    manifestVersion: record.manifestVersion,
    app: { id: record.appId, slug: "", name: "", route: record.route, status: "published" },
    prd: { versionId: record.prdVersionId, version: record.prdVersion },
    frontend: { checkpointId: record.frontendCheckpointId, version: "", checksum: "", routes: [] },
    auth: { mode: "platform_auth_sdk", accessMode: "restricted" },
    roles: Array.isArray(record.roleSnapshot) ? (record.roleSnapshot as AppManifest["roles"]) : [],
    database: record.databaseSnapshot && typeof record.databaseSnapshot === "object" ? (record.databaseSnapshot as AppManifest["database"]) : { schemaName: "", tables: [] },
    generatedAt: toIsoString(record.generatedAt),
  };
}

function manifestRecord(manifest: AppManifest): AppManifestRecord {
  return {
    id: manifest.id,
    appId: manifest.appId,
    projectId: manifest.projectId,
    manifestVersion: manifest.manifestVersion,
    prdVersionId: manifest.prd.versionId,
    prdVersion: manifest.prd.version,
    frontendCheckpointId: manifest.frontend.checkpointId,
    route: manifest.app.route,
    authMode: manifest.auth.mode,
    roleSnapshot: manifest.roles,
    databaseSnapshot: manifest.database,
    manifest,
    sourceCommitSha: manifest.runtime?.sourceCommitSha,
    deploymentRevisionId: manifest.runtime?.deploymentRevisionId,
    generatedAt: new Date(manifest.generatedAt)
  };
}

function mapTicket(record: SupportTicketRecord): SupportTicket {
  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    appId: record.appId,
    appSlug: record.appSlug,
    projectId: record.projectId,
    submittedByUserId: record.submittedByUserId,
    submittedByEmail: record.submittedByEmail,
    type: normalizeTicketType(record.type),
    priority: normalizeTicketPriority(record.priority),
    title: record.title,
    description: record.description,
    deviceInfo: record.deviceInfo,
    screenshotUrl: record.screenshotUrl ?? undefined,
    status: normalizeTicketStatus(record.status),
    assignedToUserId: record.assignedToUserId,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    timeline: (record.timeline ?? []).map(mapTimeline),
  };
}

function mapTimeline(record: SupportTicketTimelineEntryRecord): SupportTicketTimelineEntry {
  return {
    id: record.id,
    ticketId: record.ticketId,
    status: normalizeTicketStatus(record.status),
    label: record.label,
    actorId: record.actorUserId,
    occurredAt: toIsoString(record.occurredAt),
  };
}

function mapNotification(record: InAppNotificationRecord): InAppNotification {
  return {
    id: record.id,
    userId: record.userId,
    type: record.type === "access_request" || record.type === "ticket_update" ? record.type : "app_published",
    title: record.title,
    body: record.body,
    read: record.read,
    createdAt: toIsoString(record.createdAt),
  };
}

function requireProjectAccess(actor: PlatformUser, project: PlatformProject): void {
  requireAnyRole(actor, ["admin", "creator"]);
  if (actor.role !== "admin" && project.ownerUserId !== actor.id) throw new PermissionError(`Role ${actor.role} cannot access this resource`);
}

function requireAnyRole(actor: PlatformUser, roles: PlatformUser["role"][]): void {
  if (!roles.includes(actor.role)) throw new PermissionError(`Role ${actor.role} cannot access this resource`);
}

function defaultRoles(projectSlug: string): Array<Omit<AppRoleRecord, "id" | "appId">> {
  return [
    { key: "employee", name: "Employee", permissions: ["leave:request", "leave:view-own"] },
    { key: "manager", name: "Manager", permissions: ["leave:approve", "leave:view-team"] },
    {
      key: "hr_admin",
      name: "HR Admin",
      permissions: ["leave:admin", "leave:report", `${projectSlug}:admin`],
    },
  ];
}

function defaultRoleDescription(key: string): string {
  if (key === "manager") return "Approve team leave requests and view team queue.";
  if (key === "hr_admin") return "Administer leave policies and reporting.";
  return "Request and view own leave records.";
}

function normalizeAppStatus(value: string): ManagedApp["status"] {
  if (value === "published" || value === "disabled" || value === "archived") return value;
  return "draft";
}

function normalizeUserType(value: string | undefined): AppUserType {
  return value === "external" ? "external" : "internal";
}

function normalizeMemberStatus(value: string | undefined): AppMemberRecord["status"] {
  if (value === "pending" || value === "approval_required") return value;
  return "active";
}

function normalizeInvitationStatus(value: string): AppInvitationStatus {
  if (value === "accepted" || value === "revoked" || value === "approval_required") return value;
  return "pending";
}

function normalizeAccessRequestStatus(value: string): AppAccessRequestStatus {
  if (value === "approved" || value === "rejected") return value;
  return "pending";
}

function normalizeTicketType(value: string): TicketType {
  if (value === "feedback" || value === "feature" || value === "access_issue" || value === "data_issue" || value === "performance" || value === "other") return value;
  return "bug";
}

function normalizeTicketPriority(value: string): TicketPriority {
  if (value === "low" || value === "medium" || value === "critical") return value;
  return "high";
}

function normalizeTicketStatus(value: string): TicketStatus {
  if (value === "in_review" || value === "planned" || value === "resolved" || value === "closed") return value;
  return "submitted";
}
