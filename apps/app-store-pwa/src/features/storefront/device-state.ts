import type { StoreAccessRequestResponse } from "@evcp/api-client";

export const STORE_DEVICE_STATE_KEY = "evcp-store-device-v1";
const STORE_DEVICE_STATE_VERSION = 1 as const;
const RECENT_LIMIT = 20;
const TICKET_LIMIT = 50;

export type StoreDeviceSnapshot = {
  version: 1;
  favorites: string[];
  recent: string[];
  ticketIds: string[];
  accessReceipts: StoreAccessRequestResponse[];
};

export type StoreDeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EMPTY_STORE_DEVICE_SNAPSHOT: StoreDeviceSnapshot = {
  version: STORE_DEVICE_STATE_VERSION,
  favorites: [],
  recent: [],
  ticketIds: [],
  accessReceipts: []
};

function emptySnapshot(): StoreDeviceSnapshot {
  return {
    version: STORE_DEVICE_STATE_VERSION,
    favorites: [],
    recent: [],
    ticketIds: [],
    accessReceipts: []
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value: unknown, limit?: number): string[] | undefined {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) return undefined;
  const values = [...new Set(value)];
  return limit === undefined ? values : values.slice(0, limit);
}

function isAccessReceipt(value: unknown): value is StoreAccessRequestResponse {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return isNonEmptyString(receipt.id)
    && isNonEmptyString(receipt.appSlug)
    && isNonEmptyString(receipt.requestedRoleKey)
    && isNonEmptyString(receipt.requesterEmail)
    && receipt.status === "pending"
    && isNonEmptyString(receipt.reason)
    && isNonEmptyString(receipt.createdAt)
    && (receipt.department === undefined || isNonEmptyString(receipt.department));
}

function snapshotFromUnknown(value: unknown): StoreDeviceSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.version !== STORE_DEVICE_STATE_VERSION) return undefined;
  const favorites = stringList(raw.favorites);
  const recent = stringList(raw.recent, RECENT_LIMIT);
  const ticketIds = stringList(raw.ticketIds, TICKET_LIMIT);
  if (!favorites || !recent || !ticketIds || !Array.isArray(raw.accessReceipts) || !raw.accessReceipts.every(isAccessReceipt)) {
    return undefined;
  }
  const accessReceipts = raw.accessReceipts.filter((receipt, index, receipts) =>
    receipts.findIndex((candidate) => isAccessReceipt(candidate) && candidate.id === (receipt as StoreAccessRequestResponse).id) === index
  ) as StoreAccessRequestResponse[];
  return { version: STORE_DEVICE_STATE_VERSION, favorites, recent, ticketIds, accessReceipts };
}

function cloneSnapshot(snapshot: StoreDeviceSnapshot): StoreDeviceSnapshot {
  return {
    version: STORE_DEVICE_STATE_VERSION,
    favorites: [...snapshot.favorites],
    recent: [...snapshot.recent],
    ticketIds: [...snapshot.ticketIds],
    accessReceipts: snapshot.accessReceipts.map((receipt) => ({ ...receipt }))
  };
}

function latestFirst(values: string[], value: string, limit?: number): string[] {
  const next = [value, ...values.filter((item) => item !== value)];
  return limit === undefined ? next : next.slice(0, limit);
}

export function createStoreDeviceState(storage: StoreDeviceStorage) {
  let memory = readSnapshot();

  function readSnapshot(): StoreDeviceSnapshot {
    try {
      const serialized = storage.getItem(STORE_DEVICE_STATE_KEY);
      if (!serialized) return emptySnapshot();
      return snapshotFromUnknown(JSON.parse(serialized)) ?? emptySnapshot();
    } catch {
      return emptySnapshot();
    }
  }

  function persist(next: StoreDeviceSnapshot): void {
    memory = cloneSnapshot(next);
    try {
      storage.setItem(STORE_DEVICE_STATE_KEY, JSON.stringify(memory));
    } catch {
      // Device storage is optional. Keep the current page's state without surfacing a storage failure.
    }
  }

  return {
    read(): StoreDeviceSnapshot {
      return cloneSnapshot(memory);
    },
    toggleFavorite(appSlug: string): void {
      if (!isNonEmptyString(appSlug)) return;
      const favorites = memory.favorites.includes(appSlug)
        ? memory.favorites.filter((slug) => slug !== appSlug)
        : [...memory.favorites, appSlug];
      persist({ ...memory, favorites });
    },
    recordRecent(appSlug: string): void {
      if (!isNonEmptyString(appSlug)) return;
      persist({ ...memory, recent: latestFirst(memory.recent, appSlug, RECENT_LIMIT) });
    },
    rememberTicket(ticketId: string): void {
      if (!isNonEmptyString(ticketId)) return;
      persist({ ...memory, ticketIds: latestFirst(memory.ticketIds, ticketId, TICKET_LIMIT) });
    },
    rememberAccessReceipt(receipt: StoreAccessRequestResponse): void {
      if (!isAccessReceipt(receipt)) return;
      persist({
        ...memory,
        accessReceipts: [receipt, ...memory.accessReceipts.filter((item) => item.id !== receipt.id)]
      });
    },
    clear(): boolean {
      memory = emptySnapshot();
      try {
        storage.removeItem(STORE_DEVICE_STATE_KEY);
        return true;
      } catch {
        return false;
      }
    }
  };
}

export { EMPTY_STORE_DEVICE_SNAPSHOT };
