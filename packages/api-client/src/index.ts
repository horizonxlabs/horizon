export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { ok: true, data, meta };
}

export function failure(code: string, message: string, traceId?: string): ApiFailure {
  return {
    ok: false,
    error: { code, message, traceId }
  };
}

export type PlatformUserDto = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
};

export type PlatformAuthEvidenceDto = {
  mode: "platform_session" | "mock_header";
  sessionId?: string;
  expiresAt?: string;
  legacyMockFallback: boolean;
};

export type CurrentUserResponse = {
  user: PlatformUserDto;
  permissions: string[];
  auth: PlatformAuthEvidenceDto;
};

export type PlatformProjectDto = {
  id: string;
  slug: string;
  name: string;
  status: string;
  ownerUserId: string;
  appType: string;
  businessProblem: string;
  targetDepartment: string;
  intendedUsers: string[];
  dataSensitivity: "public" | "internal" | "confidential" | "restricted";
  appId?: string;
  activeFrontendCheckpointId?: string;
  createdAt: string;
};

export type StorefrontAppCardDto = {
  id: string;
  appId: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  ownerName: string;
  route: string;
  accessStatus: "active" | "available" | "pending";
  myRole?: string;
  health: string;
  version: string;
  lastUpdated: string;
  primaryAction: string;
};

export type StorefrontHomeResponse = {
  profile: {
    userName: string;
    email: string;
  };
  myApps: StorefrontAppCardDto[];
  availableApps: StorefrontAppCardDto[];
  notifications: unknown[];
};

export type PlatformApiClientOptions = {
  baseUrl: string;
  sessionToken?: string;
  legacyUserEmail?: string;
  fetcher?: typeof fetch;
};

export class PlatformApiError extends Error {
  readonly code: string;
  readonly traceId?: string;
  readonly status?: number;

  constructor(input: { code: string; message: string; traceId?: string; status?: number }) {
    super(input.message);
    this.name = "PlatformApiError";
    this.code = input.code;
    this.traceId = input.traceId;
    this.status = input.status;
  }
}

export class PlatformApiClient {
  private readonly baseUrl: string;
  private readonly sessionToken?: string;
  private readonly legacyUserEmail?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: PlatformApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.sessionToken = options.sessionToken;
    this.legacyUserEmail = options.legacyUserEmail;
    this.fetcher = options.fetcher ?? fetch;
  }

  getCurrentUser(): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>("/auth/me");
  }

  listProjects(): Promise<PlatformProjectDto[]> {
    return this.request<PlatformProjectDto[]>("/projects");
  }

  listStoreApps(): Promise<StorefrontHomeResponse> {
    return this.request<StorefrontHomeResponse>("/store/apps");
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init.headers)
    });
    const envelope = (await response.json()) as ApiResult<T>;
    if (!response.ok || !envelope.ok) {
      const error = envelope.ok
        ? { code: `HTTP_${response.status}`, message: response.statusText }
        : envelope.error;
      throw new PlatformApiError({
        code: error.code,
        message: error.message,
        traceId: error.traceId,
        status: response.status
      });
    }
    return envelope.data;
  }

  private headers(input?: HeadersInit): Headers {
    const headers = new Headers(input);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (this.sessionToken) {
      headers.set("authorization", `Bearer ${this.sessionToken}`);
    } else if (this.legacyUserEmail) {
      headers.set("x-mock-user-email", this.legacyUserEmail);
    }
    return headers;
  }
}

export function createPlatformApiClient(options: PlatformApiClientOptions): PlatformApiClient {
  return new PlatformApiClient(options);
}
