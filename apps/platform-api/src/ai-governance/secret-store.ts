import { readFile as readFileFromDisk } from "node:fs/promises";

export interface AiSecretStore {
  readonly provider: string;
  write(keyId: string, value: string): Promise<string>;
  read(reference: string): Promise<string>;
}

export class UnavailableAiSecretStore implements AiSecretStore {
  readonly provider = "unconfigured";
  async write(): Promise<string> { throw new Error("Production AI secret store is not configured"); }
  async read(): Promise<string> { throw new Error("Production AI secret store is not configured"); }
}

/** Test-only store; it is never constructed by Prisma/private-server runtime. */
export class MemoryAiSecretStore implements AiSecretStore {
  readonly provider = "memory-test-only";
  private static readonly values = new Map<string, string>();
  async write(keyId: string, value: string): Promise<string> { const ref = `memory://ai-provider-keys/${keyId}`; MemoryAiSecretStore.values.set(ref, value); return ref; }
  async read(reference: string): Promise<string> { const value = MemoryAiSecretStore.values.get(reference); if (!value) throw new Error("AI secret reference is unavailable"); return value; }
}

export class VaultKvV2AiSecretStore implements AiSecretStore {
  readonly provider = "vault-kv-v2";
  constructor(private readonly options: { address: string; mount: string; tokenFile: string; fetcher?: typeof fetch; readFile?: (path: string) => Promise<string> }) {}
  async write(keyId: string, value: string): Promise<string> {
    const path = `ai-provider-keys/${keyId}`;
    await this.request(`/v1/${this.options.mount}/data/${path}`, "POST", { data: { value } });
    return `vault://${this.options.mount}/data/${path}`;
  }
  async read(reference: string): Promise<string> {
    const match = reference.match(/^vault:\/\/([^/]+)\/data\/(.+)$/);
    if (!match || match[1] !== this.options.mount) throw new Error("AI secret reference does not belong to configured Vault mount");
    const response = await this.request(`/v1/${this.options.mount}/data/${match[2]}`, "GET");
    const value = (response as { data?: { data?: { value?: unknown } } }).data?.data?.value;
    if (typeof value !== "string" || !value) throw new Error("Vault AI secret is missing");
    return value;
  }
  private async request(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
    const token = String(await (this.options.readFile ?? readFileFromDisk)(this.options.tokenFile)).trim();
    if (!token) throw new Error("Vault token file is empty");
    const response = await (this.options.fetcher ?? fetch)(`${this.options.address.replace(/\/$/, "")}${path}`, { method, headers: { "X-Vault-Token": token, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`Vault secret operation failed (${response.status})`);
    return response.json();
  }
}
