import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { StorePageHeader } from "../StorePageHeader";
import { StoreStatePanel } from "../StoreStatePanel";
import { useStorefront } from "../StoreProvider";

export function StoreAccessRequestsPage() {
  const { allApps, device } = useStorefront();
  const appsBySlug = new Map(allApps.map((app) => [app.slug, app]));

  return (
    <section className="store-page store-device-history-page">
      <StorePageHeader
        eyebrow="Request receipts"
        title="Access Requests"
        description="Request receipts and current access remembered on this device."
        count={device.accessReceipts.length}
        deviceLocal
      />
      {device.accessReceipts.length ? (
        <div
          className="store-history-list"
          aria-label="Access-request receipts stored on this device"
        >
          {device.accessReceipts.map((receipt) => {
            const app = appsBySlug.get(receipt.appSlug);
            const content = (
              <>
                <div>
                  <strong>{app?.name ?? receipt.appSlug}</strong>
                  <span>{app?.description ?? "Unavailable in current catalog"}</span>
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
                      <small>Current access</small>
                      <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
                        {app.accessStatus}
                      </ToneBadge>
                    </>
                  ) : (
                    <small>Current access unavailable</small>
                  )}
                  <time>{receipt.createdAt}</time>
                </div>
              </>
            );
            return app ? (
              <a
                className="store-history-card store-history-link"
                href={`/store/apps/${encodeURIComponent(app.slug)}`}
                key={receipt.id}
                onClick={(event) => {
                  event.preventDefault();
                  navigateBrowserPath(`/store/apps/${encodeURIComponent(app.slug)}`);
                }}
              >
                {content}
              </a>
            ) : (
              <article className="store-history-card store-history-unavailable" key={receipt.id}>
                {content}
              </article>
            );
          })}
        </div>
      ) : (
        <StoreStatePanel eyebrow="This device" title="No access-request receipts">
          <p>
            Submit an access request from an app detail page to remember its receipt on this device.
          </p>
        </StoreStatePanel>
      )}
    </section>
  );
}
