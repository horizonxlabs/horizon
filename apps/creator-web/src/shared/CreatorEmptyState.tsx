import type { ReactNode } from "react";

export function CreatorEmptyState({
  title,
  description,
  eyebrow,
  action,
  children
}: {
  title: string;
  description: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="creator-empty-state">
      <img
        className="creator-empty-illustration"
        src="/creator/horizon-empty-state.png"
        width={240}
        height={240}
        alt=""
        decoding="async"
      />
      <div className="creator-empty-copy" role="status">
        {eyebrow ? <span className="creator-empty-eyebrow">{eyebrow}</span> : null}
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div className="creator-empty-action">{action}</div> : null}
      {children ? <div className="creator-empty-details">{children}</div> : null}
    </div>
  );
}
