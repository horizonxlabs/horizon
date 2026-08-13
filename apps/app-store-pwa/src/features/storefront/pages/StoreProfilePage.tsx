import { useState } from "react";
import { StorePageHeader } from "../StorePageHeader";
import { useStorefront } from "../StoreProvider";

type ClearState = "idle" | "confirm" | "cleared" | "error";

export function StoreProfilePage() {
  const { bootstrap, device, clearDevicePreferences } = useStorefront();
  const [clearState, setClearState] = useState<ClearState>("idle");

  function confirmClear() {
    const persisted = clearDevicePreferences();
    setClearState(persisted ? "cleared" : "error");
  }

  return (
    <section className="store-page store-profile-page">
      <StorePageHeader
        description="Review your account identity and device-local Store preferences."
        deviceLocal
        eyebrow="Private Store profile"
        title="Profile"
      />
      <div className="store-profile-grid">
        <section className="store-account-panel">
          <span className="eyebrow">Identity and SSO</span>
          <h2>{bootstrap.userName ?? "Current account"}</h2>
          <p>{bootstrap.email}</p>
          <dl>
            <div>
              <dt>Role</dt>
              <dd>{bootstrap.role?.replace("_", " ") ?? "Not provided"}</dd>
            </div>
            <div>
              <dt>Identity source</dt>
              <dd>{bootstrap.source}</dd>
            </div>
          </dl>
        </section>
        <section className="store-account-panel">
          <span className="eyebrow">Device-local data</span>
          <h2>What this Store remembers</h2>
          <dl className="store-profile-counts">
            <div>
              <dt>Favorites</dt>
              <dd>{device.favorites.length}</dd>
            </div>
            <div>
              <dt>Recent apps</dt>
              <dd>{device.recent.length}</dd>
            </div>
            <div>
              <dt>Ticket IDs</dt>
              <dd>{device.ticketIds.length}</dd>
            </div>
            <div>
              <dt>Access receipts</dt>
              <dd>{device.accessReceipts.length}</dd>
            </div>
          </dl>
          {clearState === "confirm" ? (
            <div className="store-clear-confirm">
              <p>
                Clear only device-local Store preferences? Your signed-in session will remain
                active.
              </p>
              <button type="button" onClick={confirmClear}>
                Confirm clear
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setClearState("idle")}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setClearState("confirm")}>
              Clear device preferences
            </button>
          )}
          {clearState === "cleared" ? (
            <p role="status" className="store-action-success">
              Device preferences cleared. Your signed-in session remains active.
            </p>
          ) : null}
          {clearState === "error" ? (
            <p role="alert" className="store-action-error">
              Device storage is unavailable. Preferences were cleared for this page only; your
              signed-in session remains active.
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
