import { DataTable, SectionCard } from "@evcp/ui";
import type { PlatformApiClient } from "@evcp/api-client";
import { useEffect, useState } from "react";
import type { ProductionAuditEvent } from "@/features/platform-operations";

export function AuditEvidenceSection({ id, client }: { id?: string; client: PlatformApiClient }) {
  const [events, setEvents] = useState<ProductionAuditEvent[]>([]);
  const [message, setMessage] = useState("Loading audit evidence from Platform API.");
  useEffect(() => {
    let active = true;
    void client.request<ProductionAuditEvent[]>("/audit-logs")
      .then((result) => { if (active) { setEvents(result); setMessage("Audit evidence loaded from Platform API."); } })
      .catch(() => { if (active) { setEvents([]); setMessage("Audit evidence is unavailable. No local records are shown."); } });
    return () => { active = false; };
  }, [client]);
  return (
    <div id={id}>
      <SectionCard eyebrow="Audit Filters" title="Governance evidence search">
        <p>{message}</p>
        <DataTable
          columns={[
            { key: "action", label: "Action" },
            { key: "actorId", label: "Actor" },
            { key: "severity", label: "Severity" },
            { key: "occurredAt", label: "Time" }
          ]}
          rows={events}
        />
      </SectionCard>
    </div>
  );
}
