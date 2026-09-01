import { randomBytes } from "node:crypto";

export type LaunchGrant = {
  appSlug: string;
  projectId: string;
  routePath: string;
  subdomain: string;
  bearerToken: string;
};

export interface LaunchGrantStore {
  create(grant: LaunchGrant, ttlSeconds: number): Promise<string>;
  consume(id: string): Promise<LaunchGrant | null>;
}

type LaunchGrantStoreOptions = {
  now?: () => number;
  randomId?: () => string;
};

type RedisLaunchGrantClient = {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
};

const LAUNCH_GRANT_KEY_PREFIX = "evcp:launch-grant:";

function createRandomId(): string {
  return randomBytes(32).toString("base64url");
}

function isLaunchGrant(value: unknown): value is LaunchGrant {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["appSlug", "projectId", "routePath", "subdomain", "bearerToken"].every(
    (key) => typeof candidate[key] === "string"
  );
}

export class MemoryLaunchGrantStore implements LaunchGrantStore {
  private readonly grants = new Map<string, { grant: LaunchGrant; expiresAt: number }>();
  private readonly now: () => number;
  private readonly randomId: () => string;

  constructor(input: LaunchGrantStoreOptions = {}) {
    this.now = input.now ?? Date.now;
    this.randomId = input.randomId ?? createRandomId;
  }

  async create(grant: LaunchGrant, ttlSeconds: number): Promise<string> {
    const id = this.randomId();
    this.grants.set(id, {
      grant,
      expiresAt: this.now() + ttlSeconds * 1_000
    });
    return id;
  }

  async consume(id: string): Promise<LaunchGrant | null> {
    const record = this.grants.get(id);
    if (!record) return null;
    this.grants.delete(id);
    return record.expiresAt <= this.now() ? null : record.grant;
  }
}

export class RedisLaunchGrantStore implements LaunchGrantStore {
  private readonly randomId: () => string;

  constructor(
    private readonly client: RedisLaunchGrantClient,
    input: Pick<LaunchGrantStoreOptions, "randomId"> = {}
  ) {
    this.randomId = input.randomId ?? createRandomId;
  }

  async create(grant: LaunchGrant, ttlSeconds: number): Promise<string> {
    const id = this.randomId();
    try {
      await this.client.set(`${LAUNCH_GRANT_KEY_PREFIX}${id}`, JSON.stringify(grant), {
        EX: ttlSeconds
      });
      return id;
    } catch {
      throw new Error("Launch grant storage is unavailable");
    }
  }

  async consume(id: string): Promise<LaunchGrant | null> {
    let serialized: string | null;
    try {
      serialized = await this.client.getDel(`${LAUNCH_GRANT_KEY_PREFIX}${id}`);
    } catch {
      throw new Error("Launch grant storage is unavailable");
    }
    if (!serialized) return null;
    try {
      const grant: unknown = JSON.parse(serialized);
      return isLaunchGrant(grant) ? grant : null;
    } catch {
      return null;
    }
  }
}
