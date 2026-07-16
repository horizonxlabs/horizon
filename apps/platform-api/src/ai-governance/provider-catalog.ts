import { failure, success, type ApiResult } from "@evcp/api-client";
import { ValidationError } from "../platform-services";
import type { PlatformUser } from "../platform-services";

type Request = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
export type ProviderModelCatalog = { models: Array<{ id: string; name: string; contextLength?: number }> };

export async function fetchProviderModelCatalog(input: {
  baseUrl: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProviderModelCatalog> {
  const baseUrl = input.baseUrl.trim();
  if (!baseUrl) throw new ValidationError("Provider base URL is required to load its model catalog");
  const fetcher = input.fetcher ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl.replace(/\/$/, "")}/models`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000)
    });
  } catch (error) {
    throw new ValidationError(
      `Model catalog request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) throw new ValidationError(`Model catalog request returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: Array<{ id?: unknown; name?: unknown; context_length?: unknown }>;
  };
  const models = (body.data ?? [])
    .map((entry) => {
      const id = String(entry.id ?? "").trim();
      const contextLength = Number(entry.context_length);
      return {
        id,
        name: String(entry.name ?? id).trim() || id,
        ...(Number.isFinite(contextLength) && contextLength > 0 ? { contextLength } : {})
      };
    })
    .filter((model) => model.id.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  return { models };
}

export async function handleProviderCatalogRoute(input: {
  request: Request;
  user: PlatformUser;
  fetcher?: typeof fetch;
}): Promise<{ status: number; body: ApiResult<ProviderModelCatalog> }> {
  if (input.user.role !== "admin") {
    return {
      status: 403,
      body: failure("FORBIDDEN", `Role ${input.user.role} cannot load the provider model catalog`)
    };
  }
  const baseUrl = String(input.request.body?.baseUrl ?? "").trim();
  if (!baseUrl) return { status: 400, body: failure("VALIDATION", "baseUrl is required") };
  const catalog = await fetchProviderModelCatalog({
    baseUrl,
    ...(input.fetcher ? { fetcher: input.fetcher } : {})
  });
  return { status: 200, body: success(catalog) };
}
