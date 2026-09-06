import { navigation } from "@evcp/config";
import type { CreatorProjectView } from "@/shared/types";

export type CreatorPage =
  | "projects"
  | "project"
  | "workspace"
  | "prd"
  | "database"
  | "versions"
  | "users"
  | "publish"
  | "deployments"
  | "tickets"
  | "settings"
  | "ticket-detail"
  | "not-found";

export type CreatorRoute = {
  page: CreatorPage;
  projectId?: string;
  ticketId?: string;
};

export type CreatorSelectablePage = Exclude<CreatorPage, "ticket-detail" | "not-found">;

export function projectSwitchTargetPage(page: CreatorPage): CreatorSelectablePage {
  if (page === "projects" || page === "not-found") return "workspace";
  if (page === "ticket-detail") return "tickets";
  return page;
}

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
  if (suffix === "tickets" && segments.length === 5 && segments[4]) {
    const ticketId = decodeRouteSegment(segments[4]);
    return ticketId === undefined
      ? { page: "not-found", projectId }
      : { page: "ticket-detail", projectId, ticketId };
  }
  if (segments.length !== 4) return { page: "not-found", projectId };
  const pageBySuffix = {
    project: "project",
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets",
    settings: "settings"
  } as const;
  return pageBySuffix[suffix as keyof typeof pageBySuffix]
    ? { page: pageBySuffix[suffix as keyof typeof pageBySuffix], projectId }
    : { page: "not-found", projectId };
}

export function creatorPathForPage(projectId: string, page: CreatorSelectablePage): string {
  if (page === "projects") return "/creator/";
  const base = `/creator/projects/${encodeURIComponent(projectId)}`;
  const suffix: Partial<Record<CreatorSelectablePage, string>> = {
    project: "project",
    prd: "prd",
    database: "database",
    versions: "versions",
    users: "users",
    publish: "publish",
    deployments: "deployments",
    tickets: "tickets",
    settings: "settings"
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

// "PRD Review" moved into the workspace as a tab (workspace-first flow) — no sidebar entry.
const EXCLUDED_CREATOR_NAV_LABELS = new Set(["Creator Workspace", "PRD Review"]);

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
    description: "Choose a project or start a new application from a business problem."
  },
  project: {
    eyebrow: "Project: Leave Management",
    title: "Project: Leave Management",
    description: "Review project status, key information, and common actions."
  },
  workspace: {
    eyebrow: "Creator Workspace",
    title: "Creator Workspace: Leave Management",
    description: "Build and refine the application through guided AI changes."
  },
  prd: {
    eyebrow: "AI Project Notes",
    title: "Project Notes: Leave Management",
    description:
      "Optional AI-generated context for the project. Notes never block building or publishing."
  },
  database: {
    eyebrow: "Project Data",
    title: "Database",
    description: "Review project schema, tables, and records."
  },
  versions: {
    eyebrow: "Frontend History",
    title: "Frontend Versions",
    description: "Review checkpoints and restore the frontend without changing backend data."
  },
  users: {
    eyebrow: "Access Management",
    title: "Users & Roles",
    description: "Manage members, invitations, access requests, and role permissions."
  },
  publish: {
    eyebrow: "Publish & Registry",
    title: "Publish & Registry",
    description: "Review readiness and register the application for end users."
  },
  deployments: {
    eyebrow: "Deployment History",
    title: "Deployments",
    description: "Review deployment environments, versions, health, and timestamps."
  },
  tickets: {
    eyebrow: "Feedback Loop",
    title: "Tickets & Changes",
    description: "Turn Store feedback into tracked product changes."
  },
  settings: {
    eyebrow: "Project Administration",
    title: "Project Settings",
    description: "Manage project information and permanent deletion."
  },
  "ticket-detail": {
    eyebrow: "Feedback Detail",
    title: "Ticket Detail",
    description: "Review ticket details and available Platform API actions."
  },
  "not-found": {
    eyebrow: "Creator",
    title: "Page not found",
    description: "Choose a destination from Creator navigation."
  }
};
