import type { PlatformUser, StorefrontAppCard, StorefrontAppDetail } from "../platform-services";

export interface PublishedAppAccessClient {
  app: {
    findFirst(args: { where: { projectId: string } }): Promise<{
      id: string;
      status: string;
    } | null>;
  };
  appMember: {
    findMany(args: {
      where: { appId: string };
      include: { user: true };
    }): Promise<Array<{ status?: string; user?: { email: string } }>>;
  };
}

export async function canAccessPublishedProject(
  client: PublishedAppAccessClient,
  actor: PlatformUser,
  projectId: string
): Promise<boolean> {
  const app = await client.app.findFirst({ where: { projectId } });
  if (!app || app.status !== "published") return false;
  if (actor.role === "admin") return true;
  const members = await client.appMember.findMany({
    where: { appId: app.id },
    include: { user: true }
  });
  return members.some((member) => (member.status ?? "active") === "active" && member.user?.email === actor.email);
}

export function storeActionsForCard(card: StorefrontAppCard): StorefrontAppDetail["actions"] {
  if (card.accessStatus === "active") return ["open", "submit_ticket", "send_feedback"];
  return card.accessStatus === "pending" ? ["view_status"] : ["request_access"];
}
