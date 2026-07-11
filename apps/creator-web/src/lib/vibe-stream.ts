import type { VibeAction } from "./vibe-actions";

export type VibeMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: VibeAction[];
  commitSha?: string;
};

// Applies one SSE frame (token | action_start | action_chunk | action_result | commit | error) to an
// assistant message. Pure state transition, extracted from the inline handling that used
// to live inside CreatorApp's handleVibeChat so it can be unit tested in isolation. Must
// stay byte-identical in behavior to that inline logic.
export function applyVibeEvent(
  message: VibeMessage,
  type: string,
  data: Record<string, unknown>
): VibeMessage {
  const field = (key: string): string =>
    data && typeof data === "object" && key in data
      ? String((data as Record<string, unknown>)[key])
      : typeof data === "string"
        ? data
        : "";

  if (type === "token") {
    return { ...message, text: message.text + field("content") };
  }

  if (type === "action_start") {
    const id = field("actionId");
    return {
      ...message,
      actions: message.actions.some((a) => a.id === id)
        ? message.actions
        : [
            ...message.actions,
            {
              id,
              type: field("actionType") || "file",
              label: field("label"),
              status: "running" as const
            }
          ]
    };
  }

  if (type === "action_chunk") {
    const id = field("actionId");
    const content = field("content");
    return {
      ...message,
      actions: message.actions.map((a) =>
        a.id === id ? { ...a, body: (a.body ?? "") + content } : a
      )
    };
  }

  if (type === "action_result") {
    const ok =
      data && typeof data === "object" && "ok" in data
        ? Boolean((data as { ok: boolean }).ok)
        : false;
    const id = field("actionId");
    const patch = {
      type: field("actionType") || "file",
      label: field("label"),
      status: (ok ? "done" : "failed") as VibeAction["status"],
      find: field("find") || undefined,
      replace: field("replace") || undefined,
      body: field("body") || undefined,
      error: field("error") || undefined
    };
    return {
      ...message,
      actions: message.actions.some((a) => a.id === id)
        ? message.actions.map((a) => (a.id === id ? { ...a, ...patch } : a))
        : [...message.actions, { id, ...patch }]
    };
  }

  if (type === "commit") {
    return { ...message, commitSha: field("sha") };
  }

  if (type === "error") {
    return { ...message, text: message.text + `\n\n⚠️ ${field("message")}` };
  }

  return message;
}
