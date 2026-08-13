import type { ReactNode } from "react";

export function StorePageHeader({
  eyebrow,
  title,
  description,
  count,
  deviceLocal,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  count?: number;
  deviceLocal?: boolean;
  action?: ReactNode;
}) {
  return (
    <header className="store-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <div className="store-page-title-row">
          <h1>{title}</h1>
          {count === undefined ? null : <span>{count}</span>}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="store-page-heading-actions">
        {deviceLocal ? <span className="store-device-label">This device</span> : null}
        {action}
      </div>
    </header>
  );
}
