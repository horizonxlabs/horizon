export type ActionType = "file" | "edit" | "shell" | "migration" | "skill";

export type ParsedEvent =
  | { type: "text"; content: string }
  | { type: "action_start"; actionId: string; actionType: ActionType; filePath?: string; name?: string }
  | { type: "action_chunk"; actionId: string; content: string }
  | { type: "action_end"; actionId: string };

const ACTION_TYPES: ActionType[] = ["file", "edit", "shell", "migration", "skill"];

interface ParserState {
  buffer: string;
  inArtifact: boolean;
  currentAction: { actionId: string; actionType: ActionType } | null;
  actionCounter: number;
}

function extractAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

// Returns the length of the longest suffix of `buffer` that is also a prefix of `tag`,
// so we hold back only a possibly-split tag rather than an arbitrary fixed-size tail.
function partialTagOverlap(buffer: string, tag: string): number {
  const maxLen = Math.min(buffer.length, tag.length - 1);
  for (let len = maxLen; len > 0; len -= 1) {
    if (buffer.slice(buffer.length - len) === tag.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

export function createMessageParser() {
  const state: ParserState = {
    buffer: "",
    inArtifact: false,
    currentAction: null,
    actionCounter: 0
  };

  function drain(): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    for (;;) {
      if (!state.inArtifact) {
        const start = state.buffer.indexOf("<artifact");
        if (start === -1) {
          const holdBack = partialTagOverlap(state.buffer, "<artifact");
          const emitLen = state.buffer.length - holdBack;
          if (emitLen > 0) {
            events.push({ type: "text", content: state.buffer.slice(0, emitLen) });
            state.buffer = state.buffer.slice(emitLen);
          }
          return events;
        }
        const tagEnd = state.buffer.indexOf(">", start);
        if (tagEnd === -1) {
          if (start > 0) {
            events.push({ type: "text", content: state.buffer.slice(0, start) });
          }
          state.buffer = state.buffer.slice(start);
          return events;
        }
        if (start > 0) {
          events.push({ type: "text", content: state.buffer.slice(0, start) });
        }
        state.buffer = state.buffer.slice(tagEnd + 1);
        state.inArtifact = true;
        continue;
      }

      if (!state.currentAction) {
        const artifactEnd = state.buffer.indexOf("</artifact>");
        const actionStart = state.buffer.indexOf("<action");
        if (actionStart === -1 || (artifactEnd !== -1 && artifactEnd < actionStart)) {
          if (artifactEnd !== -1) {
            state.buffer = state.buffer.slice(artifactEnd + "</artifact>".length);
            state.inArtifact = false;
            continue;
          }
          return events;
        }
        const tagEnd = state.buffer.indexOf(">", actionStart);
        if (tagEnd === -1) {
          return events;
        }
        const tag = state.buffer.slice(actionStart, tagEnd + 1);
        const actionType = extractAttr(tag, "type") as ActionType | undefined;
        if (!actionType || !ACTION_TYPES.includes(actionType)) {
          throw new Error(`unknown action type '${actionType}' in tag: ${tag}`);
        }
        const filePath = extractAttr(tag, "filePath");
        const name = extractAttr(tag, "name");
        state.actionCounter += 1;
        const actionId = `act-${state.actionCounter}`;
        state.currentAction = { actionId, actionType };
        events.push({
          type: "action_start",
          actionId,
          actionType,
          ...(filePath ? { filePath } : {}),
          ...(name ? { name } : {})
        });
        state.buffer = state.buffer.slice(tagEnd + 1);
        continue;
      }

      const closeIdx = state.buffer.indexOf("</action>");
      if (closeIdx === -1) {
        // Hold back only a tail that could be the start of a split "</action>" tag.
        const holdBack = partialTagOverlap(state.buffer, "</action>");
        const emitLen = state.buffer.length - holdBack;
        if (emitLen > 0) {
          events.push({
            type: "action_chunk",
            actionId: state.currentAction.actionId,
            content: state.buffer.slice(0, emitLen)
          });
          state.buffer = state.buffer.slice(emitLen);
        }
        return events;
      }
      if (closeIdx > 0) {
        events.push({
          type: "action_chunk",
          actionId: state.currentAction.actionId,
          content: state.buffer.slice(0, closeIdx)
        });
      }
      events.push({ type: "action_end", actionId: state.currentAction.actionId });
      state.buffer = state.buffer.slice(closeIdx + "</action>".length);
      state.currentAction = null;
    }
  }

  return {
    push(chunk: string): ParsedEvent[] {
      state.buffer += chunk;
      return drain();
    },
    flush(): ParsedEvent[] {
      const events = drain();
      if (state.buffer.length > 0 && !state.inArtifact) {
        events.push({ type: "text", content: state.buffer });
        state.buffer = "";
      }
      return events;
    }
  };
}
