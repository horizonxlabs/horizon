import type { PiAgentToolLimits } from "./pi-tool-policy";

export type PiAgentLimits = PiAgentToolLimits & {
  maxModelRounds: number;
  maxTurnTokens: number;
  modelRoundTimeoutMs: number;
  maxFileBytes: number;
  turnTimeoutMs: number;
  validationRetries: number;
  toolFailureRetries: number;
  maxReasoningChars: number;
};

const defaults: PiAgentLimits = {
  // Pi uses one governed model round per tool-response cycle. A normal continuation can
  // legitimately need to inspect several prior files, write several components, then
  // finish its response and pass workspace validation. Twelve rounds truncated that
  // healthy path during real Creator builds and rolled back all successful writes.
  // Keep a firm cap (and the separate token, tool-call, reasoning, and time budgets),
  // but leave sufficient room for a multi-file continuation to reach finalization.
  maxModelRounds: 20,
  modelRoundTimeoutMs: 300_000,
  maxToolCalls: 40,
  shellTimeoutMs: 120_000,
  maxToolOutputBytes: 65_536,
  maxToolInputBytes: 120_000,
  maxFileBytes: 120_000,
  // The entire turn needs to outlive a sequence of slow local-model rounds. Ten minutes
  // aborted a real build after it had only inspected the UI kit; retain a finite ceiling
  // while permitting a complete inspect → implement → validate cycle.
  turnTimeoutMs: 1_800_000,
  validationRetries: 2,
  // A model that hits one disallowed/failed tool call (e.g. tries to rewrite package.json
  // directly instead of using the install tool) but otherwise wrote real, working files can
  // still declare victory and stop instead of self-correcting within its own session. Without
  // this nudge, that one lingering failure aborts the whole turn and rolls back every file it
  // DID write successfully — observed in production as a fully working feature silently
  // vanishing over one unrelated tool error. Giving it one explicit round of feedback lets it
  // route around the failure (or fix it) before the turn is abandoned.
  toolFailureRetries: 1,
  // promptTokens/completionTokens accumulate across every round of the turn (each round's
  // reported input tokens are summed, not deduped against the shared history/context they
  // repeat) — so this is nowhere near comparable to a single round's context window. A
  // legitimate multi-round build (e.g. wiring up a real database: read schema, write
  // migration files, update several app files, re-validate) routinely spans 5-8 rounds and
  // blew past the old 160k default well before doing anything runaway, discarding real,
  // working mutations via the same rollback path used for genuine stalls (see
  // workspaceGuard.restoreSnapshot in the catch block) — observed in production as a
  // completed feature (e.g. "app now uses real PostgreSQL...") vanishing on the next line.
  // Raised with real headroom under maximums.maxTurnTokens while still catching a turn that
  // never converges at all.
  maxTurnTokens: 600_000,
  // A model that never converges on a tool call or a final answer keeps streaming
  // "thinking" text for the full modelRoundTimeoutMs (up to 5 minutes) before the round
  // even ends — observed in practice as the agent oscillating between two plans forever.
  // Cutting a round short once its reasoning alone passes this budget turns that into a
  // fast, legible error instead of a multi-minute silent stall.
  // Small local models often produce a long hidden deliberation before their first
  // tool call. 12k cuts off legitimate first builds; keep a finite default so a
  // genuinely stalled turn still ends well before the hard maximum.
  maxReasoningChars: 60_000
};

const maximums: PiAgentLimits = {
  maxModelRounds: 64,
  maxTurnTokens: 1_000_000,
  // Equal to the default until here: EVCP_PI_MODEL_ROUND_TIMEOUT_MS could never raise the
  // per-round deadline past the platform's own 5-minute default, which starves slow (e.g.
  // local/self-hosted) models that legitimately take longer than 5 minutes to answer a
  // single round. Raised to match maximums.turnTimeoutMs: a round still can't outlive the
  // turn it belongs to, but operators can now trade round budget for slow-model headroom.
  modelRoundTimeoutMs: 1_800_000,
  maxToolCalls: 200,
  shellTimeoutMs: 300_000,
  maxToolOutputBytes: 1_048_576,
  maxToolInputBytes: 1_048_576,
  maxFileBytes: 1_048_576,
  turnTimeoutMs: 1_800_000,
  validationRetries: 5,
  toolFailureRetries: 3,
  maxReasoningChars: 200_000
};

export function resolvePiAgentLimits(overrides: Partial<PiAgentLimits> = {}): PiAgentLimits {
  return {
    maxModelRounds: limit(overrides.maxModelRounds, "EVCP_PI_MAX_MODEL_ROUNDS", "maxModelRounds"),
    maxTurnTokens: limit(overrides.maxTurnTokens, "EVCP_PI_MAX_TURN_TOKENS", "maxTurnTokens"),
    modelRoundTimeoutMs: limit(
      overrides.modelRoundTimeoutMs,
      "EVCP_PI_MODEL_ROUND_TIMEOUT_MS",
      "modelRoundTimeoutMs"
    ),
    maxToolCalls: limit(overrides.maxToolCalls, "EVCP_PI_MAX_TOOL_CALLS", "maxToolCalls"),
    shellTimeoutMs: limit(overrides.shellTimeoutMs, "EVCP_PI_SHELL_TIMEOUT_MS", "shellTimeoutMs"),
    maxToolOutputBytes: limit(
      overrides.maxToolOutputBytes,
      "EVCP_PI_MAX_TOOL_OUTPUT_BYTES",
      "maxToolOutputBytes"
    ),
    maxToolInputBytes: limit(
      overrides.maxToolInputBytes ?? overrides.maxFileBytes,
      "EVCP_PI_MAX_FILE_BYTES",
      "maxToolInputBytes"
    ),
    maxFileBytes: limit(overrides.maxFileBytes, "EVCP_PI_MAX_FILE_BYTES", "maxFileBytes"),
    turnTimeoutMs: limit(overrides.turnTimeoutMs, "EVCP_PI_TURN_TIMEOUT_MS", "turnTimeoutMs"),
    validationRetries: limit(
      overrides.validationRetries,
      "EVCP_PI_VALIDATION_RETRIES",
      "validationRetries"
    ),
    toolFailureRetries: limit(
      overrides.toolFailureRetries,
      "EVCP_PI_TOOL_FAILURE_RETRIES",
      "toolFailureRetries"
    ),
    maxReasoningChars: limit(
      overrides.maxReasoningChars,
      "EVCP_PI_MAX_REASONING_CHARS",
      "maxReasoningChars"
    )
  };
}

function limit(
  override: number | undefined,
  environmentName: string,
  key: keyof PiAgentLimits
): number {
  const candidate = override ?? Number(process.env[environmentName] ?? defaults[key]);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < 1) {
    return defaults[key];
  }
  return Math.min(candidate, maximums[key]);
}
