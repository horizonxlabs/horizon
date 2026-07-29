import { navigation } from "@evcp/config";
import type { CreatorProjectView } from "@/shared/types";

export type CreatorPage =
  | "projects"
  | "workspace"
  | "prd"
  | "database"
  | "versions"
  | "users"
  | "publish"
  | "deployments"
  | "tickets"
  | "ticket-detail"
  | "not-found";

export type CreatorRoute = {
  page: CreatorPage;
  projectId?: string;
  ticketId?: string;
};

export type CreatorSelectablePage = Exclude<CreatorPage, "ticket-detail" | "not-found">;

function decodeRouteSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

export function creatorRouteFromPath(pathname: string): CreatorRoute {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "creator") return { page: "projects" };
  if (segments[0] !== "creator" || segments[1] !== "projects" || !segments[2])
    return { page: "not-found" };
  const projectId = decodeRouteSegment(segments[2]);
  if (projectId === undefined) return { page: "not-found" };
  if (segments.length === 3) return { page: "workspace", projectId };
  const suffix = segments[3];
  if (suffix === "tickets" && segments[4]) {
    const ticketId = decodeRouteSegment(segments[4]);
    return ticketId === undefined
      ? { page: "not-found", projectId }
      : { page: "ticket-detail", projectId, ticketId };
  }
  const pageBySuffix = {
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets"
  } as const;
  return pageBySuffix[suffix as keyof typeof pageBySuffix]
    ? { page: pageBySuffix[suffix as keyof typeof pageBySuffix], projectId }
    : { page: "not-found", projectId };
}

export function creatorPathForPage(projectId: string, page: CreatorSelectablePage): string {
  if (page === "projects") return "/creator/";
  const base = `/creator/projects/${encodeURIComponent(projectId)}`;
  const suffix: Partial<Record<CreatorSelectablePage, string>> = {
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets"
  };
  return page === "workspace" ? base : `${base}/${suffix[page]}`;
}

export function projectRouteSegmentFromPath(pathname: string): string | undefined {
  return creatorRouteFromPath(pathname).projectId;
}

export function slugifyProjectName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "untitled-project"
  );
}

const EXCLUDED_CREATOR_NAV_LABELS = new Set(["Creator Workspace"]);

export function createCreatorNavigation(project: CreatorProjectView) {
  const projectBaseRoute = `/creator/projects/${encodeURIComponent(project.id)}`;
  return navigation.creator
    .filter((item) => !EXCLUDED_CREATOR_NAV_LABELS.has(item.label))
    .map((item) => {
      const isProjectScoped = item.route.includes("/creator/projects/leave-management");
      if (!isProjectScoped) return item;
      return {
        ...item,
        route: item.route.replace("/creator/projects/leave-management", projectBaseRoute)
      };
    });
}

export const creatorPageCopy: Record<
  CreatorPage,
  { eyebrow: string; title: string; description: string }
> = {
  projects: {
    eyebrow: "Creator Projects",
    title: "Projects",
    description: "เลือก project หรือเริ่มสร้างแอปใหม่จาก business problem"
  },
  workspace: {
    eyebrow: "Creator Workspace",
    title: "Creator Workspace: Leave Management",
    description:
      "ใช้ prompt เพื่อสร้างหรือแก้ frontend preview หลังจากมี PRD draft/baseline ของ project ที่เลือก"
  },
  prd: {
    eyebrow: "PRD Baseline",
    title: "PRD Review: Leave Management",
    description: "ตรวจ PRD sections, version history และ confirm baseline ก่อน generate app"
  },
  database: {
    eyebrow: "Project Data",
    title: "Database",
    description: "ตรวจ schema, tables และ records จากฐานข้อมูลของ project ที่เลือก"
  },
  versions: {
    eyebrow: "Frontend History",
    title: "Frontend Versions",
    description:
      "ตรวจ checkpoint history และ restore เฉพาะ frontend โดยไม่เปลี่ยน backend หรือข้อมูล"
  },
  users: {
    eyebrow: "Access Management",
    title: "Users & Roles",
    description: "จัดการ app members, invitations, access requests และ role permission matrix"
  },
  publish: {
    eyebrow: "Publish & Registry",
    title: "Publish & Registry",
    description: "ตรวจ manifest, readiness checklist และลงทะเบียนแอปก่อนเปิดให้ end user ใช้งาน"
  },
  deployments: {
    eyebrow: "Deployment History",
    title: "Deployments",
    description: "ตรวจ environment, commit, health และเวลาของ deployment ที่ Platform API ส่งกลับ"
  },
  tickets: {
    eyebrow: "Feedback Loop",
    title: "Tickets & Changes",
    description: "รับ bug/feedback จาก Horizon Store แล้วแปลงเป็น PRD change หรือ AI prompt"
  },
  "ticket-detail": {
    eyebrow: "Feedback Detail",
    title: "Ticket Detail",
    description: "ตรวจรายละเอียด ticket และ action ที่ Platform API รองรับ"
  },
  "not-found": {
    eyebrow: "Creator",
    title: "Page not found",
    description: "เลือก destination จาก Creator navigation"
  }
};
