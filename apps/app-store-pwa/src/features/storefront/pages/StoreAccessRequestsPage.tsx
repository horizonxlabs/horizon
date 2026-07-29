import { SectionCard, ToneBadge } from "@evcp/ui";
import { MonitorSmartphone } from "lucide-react";
import { useStorefront } from "../StoreProvider";

export function StoreAccessRequestsPage() {
  const { allApps, device } = useStorefront();
  const appsBySlug = new Map(allApps.map((app) => [app.slug, app]));

  return (
    <section className="store-page store-device-history-page">
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">Request receipts</span>
          <h1>Access Requests</h1>
          <p>Receipts remembered after a successful request.</p>
        </div>
        <span className="store-device-label">
          <MonitorSmartphone size={15} /> Stored on this device
        </span>
      </div>
      {device.accessReceipts.length ? (
        <div
          className="store-history-list"
          aria-label="Access-request receipts stored on this device"
        >
          {device.accessReceipts.map((receipt) => {
            const app = appsBySlug.get(receipt.appSlug);
            return (
              <article className="store-history-card" key={receipt.id}>
                <div>
                  <strong>{app?.name ?? receipt.appSlug}</strong>
                  <span>
                    {app ? app.description : "This app is not available in the current catalog."}
                  </span>
                  <small>
                    Requested role: {receipt.requestedRoleKey} · {receipt.requesterEmail}
                  </small>
                  <small>
                    {receipt.department ? `${receipt.department} · ` : ""}
                    {receipt.reason}
                  </small>
                </div>
                <div className="store-history-meta">
                  <small>Device receipt status</small>
                  <ToneBadge tone="warning">{receipt.status}</ToneBadge>
                  {app ? (
                    <>
                      <small>Current access status</small>
                      <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
                        {app.accessStatus}
                      </ToneBadge>
                    </>
                  ) : (
                    <small>Current access status unavailable</small>
                  )}
                  <small>{receipt.createdAt}</small>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <SectionCard eyebrow="Stored on this device" title="No access-request receipts">
          <p>
            Submit an access request from an app detail page to remember its receipt on this device.
          </p>
        </SectionCard>
      )}
    </section>
  );
}
