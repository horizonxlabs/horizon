import type { ReactNode } from "react";

export function formatDatabaseValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en").format(value);
  if (typeof value === "object") {
    return <code className="hz-db-object-value">{JSON.stringify(value)}</code>;
  }

  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : undefined;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : text;
}
