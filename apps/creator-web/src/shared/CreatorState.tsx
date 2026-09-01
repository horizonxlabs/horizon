import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle, WifiOff } from "lucide-react";

export type CreatorStateKind = "loading" | "empty" | "unavailable" | "error";

const iconByKind: Record<CreatorStateKind, ReactNode> = {
  loading: <LoaderCircle className="creator-state-spinner" />,
  empty: <Inbox />,
  unavailable: <WifiOff />,
  error: <AlertCircle />
};

export function CreatorState({
  kind,
  title,
  description,
  action,
  technicalDetails
}: {
  kind: CreatorStateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  technicalDetails?: string;
}) {
  return (
    <div className={`creator-state creator-state-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span className="creator-state-icon" aria-hidden="true">
        {iconByKind[kind]}
      </span>
      <div className="creator-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div className="creator-state-action">{action}</div> : null}
        {technicalDetails ? (
          <details>
            <summary>Technical details</summary>
            <pre>{technicalDetails}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
