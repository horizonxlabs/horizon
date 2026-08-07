import type { UserRecord } from "./publish-store-persistence-types";

export function defaultUserRecord(userId: string, email?: string): UserRecord {
  if (userId === "usr_creator") {
    return { id: userId, email: "creator@company.com", name: "Creator User" };
  }
  if (userId === "usr_end_user") {
    return { id: userId, email: "user@company.com", name: "End User" };
  }
  const safeEmail = email ?? `${userId.replace(/^usr_/, "")}@company.com`;
  return { id: userId, email: safeEmail, name: defaultUserName(userId, safeEmail) };
}

export function defaultUserName(userId: string, fallback: string): string {
  if (userId === "usr_creator") return "Creator User";
  if (userId === "usr_end_user") return "End User";
  if (fallback.includes("@")) return fallback.split("@")[0] ?? fallback;
  return fallback;
}
