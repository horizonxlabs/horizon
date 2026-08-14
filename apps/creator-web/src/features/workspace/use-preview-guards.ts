import { usePreviewErrorRelay } from "./use-preview-error-relay";
import { usePreviewSessionKeepalive } from "./use-preview-session-keepalive";

// The preview's two background guards in one hook: cookie keepalive (session never
// silently expires) and the error relay (browser crashes feed the self-debug loop).
export function usePreviewGuards(input: {
  projectId: string;
  enabled: boolean;
  submitPrompt: (prompt: string) => void;
}): void {
  usePreviewSessionKeepalive({ projectId: input.projectId, enabled: input.enabled });
  usePreviewErrorRelay(input);
}
