import type { PlatformApiClient } from "@evcp/api-client";
import { Badge, Button, DecisionPanel, Drawer, Field, Input, PageHeader, SectionCard, Table, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import { describeUpdateStatus, isVersionAtTarget } from "./lib/system-update";
import { useSystemUpdate } from "./use-system-update";

/** Admin-only "System" page: current platform version, each app service's image tag, and a
 * target-tag rollout control. Owns the `useSystemUpdate` hook (mirrors UsersConsole /
 * KnowledgeSkillsConsole, which likewise take `client` and hold their own controller) — all
 * business logic lives in the hook and lib, this component only renders from it. */
export function SystemUpdatePanel({ client }: { client: PlatformApiClient }) {
  const system = useSystemUpdate(client);
  const [targetTag, setTargetTag] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = system.status === "updating";

  function confirmUpdate() {
    setConfirmOpen(false);
    void system.update(targetTag.trim());
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="Platform version"
        description="View the running image tag for every app service and roll out a new version."
      />

      {system.loadError ? (
        <DecisionPanel
          tone="danger"
          badge="unavailable"
          title={system.loadError}
          lines={["Version evidence is loaded from Platform API; unavailable data is never shown as a fallback success."]}
        />
      ) : null}

      {system.status !== "idle" ? (
        <DecisionPanel
          tone={system.status === "done" ? "success" : system.status === "error" ? "danger" : "warning"}
          badge={system.status}
          title={describeUpdateStatus(system.status, system.targetTag, system.pollNote)}
          lines={
            system.status === "updating"
              ? ["Platform API restarts itself as the last step of the rollout; polling keeps retrying through that."]
              : []
          }
        />
      ) : null}

      <SectionCard eyebrow="Current" title="Platform version" actions={<Badge tone="info">{system.version?.currentVersion || "unknown"}</Badge>}>
        <p className="text-sm text-muted">Image repository: {system.version?.imageRepository || "unknown"}</p>
      </SectionCard>

      <SectionCard eyebrow="Services" title="App service tags">
        <Table>
          <THead>
            <TRow>
              <TCell>Service</TCell>
              <TCell>Image</TCell>
              <TCell>Tag</TCell>
              <TCell>Status</TCell>
            </TRow>
          </THead>
          <tbody>
            {(system.version?.appServices ?? []).map((service) => (
              <TRow key={service.name}>
                <TCell>{service.name}</TCell>
                <TCell>{service.image}</TCell>
                <TCell>{service.tag}</TCell>
                <TCell>
                  <Badge tone={system.targetTag && service.tag === system.targetTag ? "success" : "neutral"}>
                    {system.targetTag && service.tag === system.targetTag ? "at target" : "current"}
                  </Badge>
                </TCell>
              </TRow>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard eyebrow="Update" title="Roll out a new version">
        <div className="flex flex-col gap-4">
          <Field label="Target tag" htmlFor="system-target-tag" hint="Applied to every app service image; Platform API updates last and restarts itself.">
            <Input
              id="system-target-tag"
              placeholder="v1.4.0"
              value={targetTag}
              disabled={busy}
              onChange={(event) => setTargetTag(event.target.value)}
            />
          </Field>
          <div>
            <Button disabled={busy || targetTag.trim().length === 0} onClick={() => setConfirmOpen(true)}>
              {busy ? "Updating…" : "Update"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <Drawer
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Update platform to ${targetTag}?`}
        description="Every app service image is updated to this tag; Platform API restarts itself last."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmUpdate}>Confirm update</Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          This rolls out <strong className="text-body">{targetTag}</strong> to {(system.version?.appServices ?? []).length} app
          service{(system.version?.appServices ?? []).length === 1 ? "" : "s"}. The console will poll until every service reports
          the new tag{isVersionAtTarget(system.version, targetTag) ? " (already at target)." : "."}
        </p>
      </Drawer>
    </section>
  );
}
