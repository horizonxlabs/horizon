import type {
  AppAccessRequestRecord,
  AppInstallationRecord,
  AppInvitationRecord,
  AppManifestRecord,
  AppMemberRecordData,
  AppRecord,
  AppRoleRecord,
  AppStoreRegistryEntryRecord,
  DeploymentRecordData,
  InAppNotificationRecord,
  PublishRequestRecordData,
  PublishStorePersistenceClient,
  SupportTicketRecord,
  SupportTicketTimelineEntryRecord,
  UserRecord
} from "./publish-store-persistence-types";
import {
  matchesAccessRequest,
  matchesApp,
  matchesAppScoped,
  matchesInstallation,
  matchesTicket,
  sortByDate,
  updateById
} from "./publish-store-record-utils";
import { defaultUserRecord } from "./publish-store-users";

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
    }> = {}
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
    this.users = seed.users ?? [
      defaultUserRecord("usr_creator"),
      defaultUserRecord("usr_end_user")
    ];

    this.platformUser = {
      findUnique: async ({ where }) =>
        this.users.find(
          (user) =>
            (where.id !== undefined && user.id === where.id) ||
            (where.email !== undefined && user.email === where.email)
        ) ?? null
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
      update: async ({ where, data }) => updateById(this.apps, where.id, data, "app")
    };
    this.appRole = {
      findMany: async ({ where }) => this.roles.filter((role) => role.appId === where.appId),
      upsert: async ({ where, update, create }) => {
        const index = this.roles.findIndex(
          (role) => role.appId === where.appId_key.appId && role.key === where.appId_key.key
        );
        if (index >= 0) {
          const next = { ...this.roles[index], ...update };
          this.roles[index] = next;
          return next;
        }
        this.roles.push(create);
        return create;
      }
    };
    this.appMember = {
      findMany: async ({ where }) =>
        this.members
          .filter((member) => member.appId === where.appId)
          .map((member) => this.withMemberRelations(member)),
      create: async ({ data }) => {
        const member = {
          ...data,
          user:
            this.users.find((user) => user.id === data.userId) ?? defaultUserRecord(data.userId),
          role: this.roles.find((role) => role.id === data.roleId)
        };
        this.members.push(member);
        return this.withMemberRelations(member);
      }
    };
    this.appInstallation = {
      findFirst: async ({ where }) =>
        this.installations.find((installation) => matchesInstallation(installation, where)) ?? null,
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.installations.filter((installation) => matchesInstallation(installation, where)),
          "installedAt",
          orderBy?.installedAt
        ),
      upsert: async ({ where, update, create }) => {
        const index = this.installations.findIndex(
          (installation) =>
            installation.appId === where.appId_userId.appId &&
            installation.userId === where.appId_userId.userId
        );
        if (index >= 0) {
          const next = { ...this.installations[index], ...update };
          this.installations[index] = next;
          return next;
        }
        this.installations.push(create);
        return create;
      },
      update: async ({ where, data }) =>
        updateById(this.installations, where.id, data, "app installation")
    };
    this.appInvitation = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.invitations.filter((invitation) => matchesAppScoped(invitation, where)),
          "createdAt",
          orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.invitations.push(data);
        return data;
      }
    };
    this.appAccessRequest = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.accessRequests.filter((request) => matchesAccessRequest(request, where)),
          "createdAt",
          orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.accessRequests.push(data);
        return data;
      },
      update: async ({ where, data }) =>
        updateById(this.accessRequests, where.id, data, "app access request")
    };
    this.appManifest = {
      findFirst: async ({ where }) =>
        this.manifests.find(
          (manifest) =>
            (!where.projectId || manifest.projectId === where.projectId) &&
            (!where.appId || manifest.appId === where.appId)
        ) ?? null,
      upsert: async ({ where, update, create }) => {
        const index = this.manifests.findIndex((manifest) => manifest.appId === where.appId);
        if (index >= 0) {
          const next = { ...this.manifests[index], ...update };
          this.manifests[index] = next;
          return next;
        }
        this.manifests.push(create);
        return create;
      }
    };
    this.publishRequest = {
      findMany: async (args = {}) =>
        sortByDate(
          this.publishRequests.filter((record) => matchesAppScoped(record, args.where ?? {})),
          "createdAt",
          args.orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.publishRequests.push(data);
        return data;
      }
    };
    this.deploymentRecord = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.deployments.filter((record) => matchesAppScoped(record, where)),
          "publishedAt",
          orderBy?.publishedAt
        ),
      create: async ({ data }) => {
        this.deployments.push(data);
        return data;
      }
    };
    this.appStoreRegistryEntry = {
      findMany: async (args = {}) =>
        sortByDate(
          this.registry.filter(
            (entry) => !args.where?.status || entry.status === args.where.status
          ),
          "publishedAt",
          args.orderBy?.publishedAt
        ),
      findFirst: async ({ where }) =>
        this.registry.find(
          (entry) =>
            (!where.slug || entry.slug === where.slug) &&
            (!where.subdomain || entry.subdomain === where.subdomain) &&
            (!where.projectId || entry.projectId === where.projectId) &&
            (!where.appId || entry.appId === where.appId)
        ) ?? null,
      upsert: async ({ where, update, create }) => {
        const index = this.registry.findIndex((entry) => entry.appId === where.appId);
        const candidate = index >= 0 ? { ...this.registry[index], ...update } : create;
        const duplicate = candidate.subdomain
          ? this.registry.find(
              (entry) => entry.appId !== candidate.appId && entry.subdomain === candidate.subdomain
            )
          : undefined;
        if (duplicate) {
          const error = Object.assign(new Error("Unique constraint failed on subdomain"), {
            code: "P2002"
          });
          throw error;
        }
        if (index >= 0) {
          this.registry[index] = candidate;
          return candidate;
        }
        this.registry.push(candidate);
        return candidate;
      }
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
          args.orderBy?.createdAt
        ).map((ticket) => this.withTicketTimeline(ticket)),
      create: async ({ data }) => {
        const { timeline, ...ticket } = data;
        this.tickets.push(ticket);
        if (timeline) this.ticketTimeline.push(...timeline);
        return this.withTicketTimeline(ticket);
      }
    };
    this.supportTicketTimelineEntry = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.ticketTimeline.filter((entry) => entry.ticketId === where.ticketId),
          "occurredAt",
          orderBy?.occurredAt
        ),
      create: async ({ data }) => {
        if (!this.ticketTimeline.some((entry) => entry.id === data.id))
          this.ticketTimeline.push(data);
        return data;
      }
    };
    this.inAppNotification = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.notifications.filter((notification) => notification.userId === where.userId),
          "createdAt",
          orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.notifications.push(data);
        return data;
      }
    };
  }

  private withMemberRelations(member: AppMemberRecordData): AppMemberRecordData {
    return {
      ...member,
      user: member.user ?? defaultUserRecord(member.userId),
      role: member.role ?? this.roles.find((role) => role.id === member.roleId)
    };
  }

  private withTicketTimeline(ticket: Omit<SupportTicketRecord, "timeline">): SupportTicketRecord {
    return {
      ...ticket,
      timeline: this.ticketTimeline
        .filter((entry) => entry.ticketId === ticket.id)
        .sort(
          (left, right) =>
            new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
        )
    };
  }
}
