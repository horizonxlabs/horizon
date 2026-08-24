import type { ReactNode } from "react";

export type CreatorStatusTone = "info" | "success" | "warning" | "danger";

export function CreatorStatusMessage({
  tone,
  children,
  technicalDetails
}: {
  tone: CreatorStatusTone;
  children: ReactNode;
  technicalDetails?: string;
}) {
  return (
    <div
      className={`creator-status-message creator-status-message-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div>{children}</div>
      {technicalDetails ? (
        <details>
          <summary>Technical details</summary>
          <pre>{technicalDetails}</pre>
        </details>
      ) : null}
    </div>
  );
}
