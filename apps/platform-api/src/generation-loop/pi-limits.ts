import type { PiAgentToolLimits } from "./pi-tool-policy";

export type PiAgentLimits = PiAgentToolLimits & {
  maxModelRounds: number;
  // Pi governs context with native auto-compaction. A cumulative token cap is optional because
  // providers report the full resent context on every agent round, which is not a context-limit
  // signal and otherwise aborts healthy Pi sessions.
  maxTurnTokens?: number;
  modelRoundTimeoutMs: number;
  maxFileBytes: number;
  maxImageCalls: number;
  maxImageBytes: number;
  turnTimeoutMs: number;
  validationRetries: number;
  toolFailureRetries: number;
  maxReasoningChars: number;
};

const defaults: PiAgentLimits = {
  // Each serial tool call consumes a model round. Allow the full 40-call tool budget
  // plus a final answer and bounded repair feedback; a 20-round cap aborted valid
  // multi-file turns before validation and rolled back their successful writes.
  // Tool, reasoning, and time budgets continue to bound the work independently.
  maxModelRounds: 48,
  modelRoundTimeoutMs: 300_000,
  maxToolCalls: 40,
  shellTimeoutMs: 120_000,
  maxToolOutputBytes: 65_536,
  maxToolInputBytes: 120_000,
  maxFileBytes: 120_000,
  // Auto image generation is capped per turn (prompt guidance says 1-2 strong images);
  // the byte cap keeps git history and publish tarballs from ballooning.
  maxImageCalls: 4,
  maxImageBytes: 4_194_304,
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
  maxImageCalls: 8,
  maxImageBytes: 8_388_608,
  turnTimeoutMs: 1_800_000,
  validationRetries: 5,
  toolFailureRetries: 3,
  maxReasoningChars: 200_000
};

export function resolvePiAgentLimits(overrides: Partial<PiAgentLimits> = {}): PiAgentLimits {
  return {
    maxModelRounds: limit(overrides.maxModelRounds, "EVCP_PI_MAX_MODEL_ROUNDS", "maxModelRounds"),
    maxTurnTokens: optionalLimit(overrides.maxTurnTokens, "EVCP_PI_MAX_TURN_TOKENS", 1_000_000),
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
    maxImageCalls: limit(overrides.maxImageCalls, "EVCP_PI_MAX_IMAGE_CALLS", "maxImageCalls"),
    maxImageBytes: limit(overrides.maxImageBytes, "EVCP_PI_IMAGE_MAX_BYTES", "maxImageBytes"),
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

function optionalLimit(
  override: number | undefined,
  environmentName: string,
  maximum: number
): number | undefined {
  const raw = override ?? process.env[environmentName];
  if (raw === undefined || raw === "") return undefined;
  const candidate = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < 1)
    return undefined;
  return Math.min(candidate, maximum);
}

function limit(
  override: number | undefined,
  environmentName: string,
  key: Exclude<keyof PiAgentLimits, "maxTurnTokens">
): number {
  const candidate = override ?? Number(process.env[environmentName] ?? defaults[key]);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < 1) {
    return defaults[key];
  }
  return Math.min(candidate, maximums[key]);
}
