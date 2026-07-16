export type ActionActionType = "file" | "edit" | "shell" | "migration";

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "action_start"; actionId: string; actionType: ActionActionType; label: string }
  | { type: "action_chunk"; actionId: string; content: string }
  | {
      type: "action_result";
      actionId: string;
      actionType: ActionActionType;
      label: string;
      ok: boolean;
      find?: string;
      replace?: string;
      body?: string;
      error?: string;
    }
  | { type: "commit"; sha: string }
  | { type: "error"; message: string }
  | { type: "done" };
