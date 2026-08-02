import type { DomainStatusDto, PlatformApiClient } from "@evcp/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOMAIN_POLL_INTERVAL_MS, type DomainGoLiveStatus } from "./lib/domain";

/** Best-effort reachability probe: an opaque no-cors fetch tells us nothing about the response
 * body or status, but a resolved promise means DNS resolved and TLS handshook — a rejected one
 * means the site does not answer yet. `fetch` is guarded for non-browser test environments. */
async function siteAnswers(domain: string): Promise<boolean> {
  if (typeof fetch !== "function") return false;
  try {
    await fetch(`https://${domain}`, { mode: "no-cors", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stateful glue for the Admin "Domain" page (Task 4). `load()` fetches the current domain
 * status; `goLive(domain)` posts the new domain then polls `getDomainStatus()` — retrying
 * through the caddy/platform-api restart the roll-out triggers — until the persisted status
 * reflects the target domain, then probes `https://<domain>` directly until it answers.
 * Mirrors use-system-update.ts: only a failed initial POST is a terminal "error"; mid-flight
 * poll failures just keep retrying.
 */
export function useDomain(client: PlatformApiClient | undefined) {
  const [status, setStatus] = useState<DomainStatusDto>();
  const [loadError, setLoadError] = useState<string>();
  const [goLiveStatus, setGoLiveStatus] = useState<DomainGoLiveStatus>("idle");
  const [targetDomain, setTargetDomain] = useState<string>();
  const [pollNote, setPollNote] = useState<string>();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const result = await client.getDomainStatus();
      setStatus(result);
      setLoadError(undefined);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Unable to load the current domain status.");
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (goLiveStatus !== "applying" || !client || !targetDomain) return;
    let cancelled = false;

    const tick = async () => {
      // Primary completion signal: the new domain answers over HTTPS (a cross-origin `no-cors`
      // probe). We do NOT gate "live" on getDomainStatus() — once caddy switches its site to the
      // domain, this console (still loaded at the old http://<ip> origin) can no longer reach the
      // same-origin API, so getDomainStatus() would fail on every tick and the panel would spin
      // forever even on a successful go-live.
      if (await siteAnswers(targetDomain)) {
        if (!cancelled) {
          setPollNote(undefined);
          setGoLiveStatus("live");
        }
        return;
      }
      // Best-effort status refresh while the old origin still answers (before the switchover).
      try {
        const result = await client.getDomainStatus();
        if (!cancelled) setStatus(result);
      } catch {
        // Expected once caddy/platform-api switch to the domain — not an error state.
      }
      if (!cancelled) {
        setPollNote(`Waiting for https://${targetDomain} to answer — check DNS + TLS, then open it directly.`);
        pollTimer.current = setTimeout(() => void tick(), DOMAIN_POLL_INTERVAL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
  }, [goLiveStatus, client, targetDomain]);

  const goLive = useCallback(
    async (domain: string) => {
      if (!client) return;
      setPollNote(undefined);
      try {
        await client.setDomain(domain);
        setTargetDomain(domain);
        setGoLiveStatus("applying");
      } catch (reason) {
        setPollNote(reason instanceof Error ? reason.message : "Unable to start the domain change.");
        setGoLiveStatus("error");
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    setGoLiveStatus("idle");
    setTargetDomain(undefined);
    setPollNote(undefined);
  }, []);

  return { status, loadError, goLiveStatus, targetDomain, pollNote, load, goLive, reset };
}

export type DomainController = ReturnType<typeof useDomain>;
