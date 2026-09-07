import { failure, success } from "@evcp/api-client";

type Headers = Record<string, string | string[] | undefined>;
type Response = {
  status(code: number): Response;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
};

function bearerToken(headers: Headers): string | undefined {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.match(/^Bearer\s+(.+)$/i)?.[1];
}

export function registerPreviewSessionRoute(input: {
  routes: {
    post(
      path: string,
      handler: (request: { headers: Headers; params?: Record<string, string> }, response: Response) => Promise<void>
    ): void;
  };
  authorize(headers: Headers, projectId: string): Promise<{ previewKey: string }>;
  secureCookie?: boolean;
}): void {
  input.routes.post("/projects/:projectId/workspace/preview-session", async (request, response) => {
    const token = bearerToken(request.headers);
    if (!token) {
      response.status(401).json(failure("UNAUTHORIZED", "A Platform session is required"));
      return;
    }
    try {
      const { previewKey } = await input.authorize(
        request.headers,
        String(request.params?.projectId ?? "")
      );
      response.setHeader?.(
        "Set-Cookie",
        `evcp_preview_token=${encodeURIComponent(token)}; Path=/preview/${previewKey}; HttpOnly; SameSite=Strict; Max-Age=900${input.secureCookie ? "; Secure" : ""}`
      );
      response.status(200).json(success({ authorized: true, previewKey }));
    } catch {
      response.status(403).json(failure("FORBIDDEN", "Preview session is unavailable"));
    }
  });
}
