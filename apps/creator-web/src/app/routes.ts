import { navigation } from "@evcp/config";
import type { CreatorProjectView } from "@/shared/types";

export type CreatorPage = "projects" | "workspace" | "prd" | "users" | "publish" | "tickets";

export function creatorPageFromPath(pathname: string): CreatorPage {
  if (pathname.endsWith("/prd")) return "prd";
  if (pathname.endsWith("/users")) return "users";
  if (pathname.endsWith("/publish")) return "publish";
  if (pathname.endsWith("/tickets")) return "tickets";
  if (pathname.includes("/creator/projects/")) return "workspace";
  return "projects";
}

export function projectRouteSegmentFromPath(pathname: string): string | undefined {
  return pathname.match(/\/creator\/projects\/([^/]+)/)?.[1];
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
  const projectBaseRoute = `/creator/projects/${project.id}`;
  return navigation.creator
    .filter((item) => !EXCLUDED_CREATOR_NAV_LABELS.has(item.label))
    .map((item) => {
      const isProjectScoped = item.route.includes("/creator/projects/leave-management");
      if (!isProjectScoped) return item;
      return {
        ...item,
        label: `${item.label} (Soon)`,
        route: item.route.replace("/creator/projects/leave-management", projectBaseRoute),
        disabled: true,
        disabledReason: "เร็วๆ นี้"
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
  tickets: {
    eyebrow: "Feedback Loop",
    title: "Tickets & Changes",
    description: "รับ bug/feedback จาก Horizon Store แล้วแปลงเป็น PRD change หรือ AI prompt"
  }
};
