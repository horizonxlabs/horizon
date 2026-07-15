import { ValidationError } from "../platform-services";
import type {
  AppAccessRequestRecord,
  AppInstallationRecord,
  AppRecord,
  DateValue,
  SupportTicketRecord
} from "./publish-store-persistence-types";

export function matchesApp(
  app: AppRecord,
  where: { projectId?: string; slug?: string; id?: string }
): boolean {
  if (where.projectId && app.projectId !== where.projectId) return false;
  if (where.slug && app.slug !== where.slug) return false;
  if (where.id && app.id !== where.id) return false;
  return true;
}

export function matchesAppScoped(
  record: { appId?: string; projectId?: string },
  where: { appId?: string; projectId?: string }
): boolean {
  if (where.appId && record.appId !== where.appId) return false;
  if (where.projectId && record.projectId !== where.projectId) return false;
  return true;
}

export function matchesAccessRequest(
  record: AppAccessRequestRecord,
  where: {
    appId?: string;
    projectId?: string;
    requesterEmail?: string;
    status?: string;
    requestedRoleKey?: string;
  }
): boolean {
  if (!matchesAppScoped(record, where)) return false;
  if (where.requesterEmail && record.requesterEmail !== where.requesterEmail) return false;
  if (where.status && record.status !== where.status) return false;
  if (where.requestedRoleKey && record.requestedRoleKey !== where.requestedRoleKey) return false;
  return true;
}

export function matchesInstallation(
  record: AppInstallationRecord,
  where: { appId?: string; userId?: string; status?: string }
): boolean {
  if (where.appId && record.appId !== where.appId) return false;
  if (where.userId && record.userId !== where.userId) return false;
  if (where.status && record.status !== where.status) return false;
  return true;
}

export function matchesTicket(
  ticket: SupportTicketRecord,
  where: { projectId?: string; submittedByUserId?: string }
): boolean {
  if (where.projectId && ticket.projectId !== where.projectId) return false;
  if (where.submittedByUserId && ticket.submittedByUserId !== where.submittedByUserId) return false;
  return true;
}

export function updateById<T extends { id: string }>(
  records: T[],
  id: string,
  data: Partial<T>,
  label: string
): T {
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) throw new ValidationError(`Unknown ${label}: ${id}`);
  const next = { ...records[index], ...data };
  records[index] = next;
  return next;
}

export function sortByDate<T>(records: T[], key: keyof T, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff =
      new Date(left[key] as DateValue).getTime() - new Date(right[key] as DateValue).getTime();
    return direction === "asc" ? diff : -diff;
  });
}

export function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function slugToId(slug: string): string {
  return slug
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function slugId(prefix: string, value: string): string {
  return `${prefix}_${slugToId(value)}`;
}
