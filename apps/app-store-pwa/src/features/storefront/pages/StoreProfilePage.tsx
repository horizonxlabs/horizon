import { useState } from "react";
import { SectionCard } from "@evcp/ui";
import { MonitorSmartphone } from "lucide-react";
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
      <div className="store-page-heading">
        <div><span className="eyebrow">Private Store profile</span><h1>Profile</h1><p>{bootstrap.userName ?? "Current account"}{bootstrap.email ? ` · ${bootstrap.email}` : ""}</p></div>
        <span className="store-device-label"><MonitorSmartphone size={15} /> Stored on this device</span>
      </div>
      <SectionCard eyebrow="Device preferences" title="What this Store remembers">
        <p>Favorites, recently viewed app slugs, ticket IDs, and access-request receipts are stored on this device only.</p>
        <dl className="store-profile-counts">
          <div><dt>Favorites</dt><dd>{device.favorites.length}</dd></div>
          <div><dt>Recent apps</dt><dd>{device.recent.length}</dd></div>
          <div><dt>Ticket IDs</dt><dd>{device.ticketIds.length}</dd></div>
          <div><dt>Access receipts</dt><dd>{device.accessReceipts.length}</dd></div>
        </dl>
        {clearState === "confirm" ? <div className="store-clear-confirm"><p>Clear only device-local Store preferences? Your signed-in session will remain active.</p><button type="button" onClick={confirmClear}>Confirm clear</button><button type="button" className="secondary-button" onClick={() => setClearState("idle")}>Cancel</button></div> : <button type="button" onClick={() => setClearState("confirm")}>Clear device preferences</button>}
        {clearState === "cleared" ? <p role="status" className="store-action-success">Device preferences cleared. Your signed-in session remains active.</p> : null}
        {clearState === "error" ? <p role="alert" className="store-action-error">Device storage is unavailable. Preferences were cleared for this page only; your signed-in session remains active.</p> : null}
      </SectionCard>
    </section>
  );
}
