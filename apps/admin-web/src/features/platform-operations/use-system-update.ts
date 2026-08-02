import type { PlatformApiClient, SystemVersionDto } from "@evcp/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isVersionAtTarget, SYSTEM_UPDATE_POLL_INTERVAL_MS, type SystemUpdateStatus } from "./lib/system-update";

/**
 * Stateful glue for the Admin "System" page (Task 3). `load()` fetches the current version;
 * `update(tag)` posts the target tag then polls `getSystemVersion()` until every app service
 * reports it. Polling retries *through* errors (platform-api restarts itself mid-update, so GET
 * requests will fail for a stretch) rather than surfacing them as a terminal "error" status —
 * only a failure to *start* the update (the initial POST) moves status to "error".
 */
export function useSystemUpdate(client: PlatformApiClient | undefined) {
  const [version, setVersion] = useState<SystemVersionDto>();
  const [loadError, setLoadError] = useState<string>();
  const [status, setStatus] = useState<SystemUpdateStatus>("idle");
  const [targetTag, setTargetTag] = useState<string>();
  const [pollNote, setPollNote] = useState<string>();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const result = await client.getSystemVersion();
      setVersion(result);
      setLoadError(undefined);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Unable to load the current system version.");
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status !== "updating" || !client || !targetTag) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await client.getSystemVersion();
        if (cancelled) return;
        setVersion(result);
        setPollNote(undefined);
        if (isVersionAtTarget(result, targetTag)) {
          setStatus("done");
          return;
        }
      } catch {
        if (cancelled) return;
        // platform-api restarts itself as the last step of the rollout — expected mid-flight
        // network failures are not an error state, just a reason to keep polling.
        setPollNote("Waiting for platform-api to come back online…");
      }
      if (!cancelled) pollTimer.current = setTimeout(() => void tick(), SYSTEM_UPDATE_POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
  }, [status, client, targetTag]);

  const update = useCallback(
    async (tag: string) => {
      if (!client) return;
      setPollNote(undefined);
      try {
        await client.updateSystemVersion(tag);
        setTargetTag(tag);
        setStatus("updating");
      } catch (reason) {
        setPollNote(reason instanceof Error ? reason.message : "Unable to start the update.");
        setStatus("error");
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setTargetTag(undefined);
    setPollNote(undefined);
  }, []);

  return { version, loadError, status, targetTag, pollNote, load, update, reset };
}

export type SystemUpdateController = ReturnType<typeof useSystemUpdate>;
