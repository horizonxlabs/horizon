import type { PiAgentToolLimits } from "./pi-tool-policy";

export type PiAgentLimits = PiAgentToolLimits & {
  maxModelRounds: number;
  maxTurnTokens: number;
  modelRoundTimeoutMs: number;
  maxFileBytes: number;
  turnTimeoutMs: number;
  validationRetries: number;
};

const defaults: PiAgentLimits = {
  maxModelRounds: 12,
  maxTurnTokens: 160_000,
  modelRoundTimeoutMs: 300_000,
  maxToolCalls: 40,
  shellTimeoutMs: 120_000,
  maxToolOutputBytes: 65_536,
  maxToolInputBytes: 120_000,
  maxFileBytes: 120_000,
  turnTimeoutMs: 600_000,
  validationRetries: 2
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
  validationRetries: 5
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
