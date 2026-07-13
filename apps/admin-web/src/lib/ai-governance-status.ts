export type AiGovernanceAvailability = "loading" | "ready" | "unavailable";

export function canMutateAiGovernance(availability: AiGovernanceAvailability): boolean {
  return availability === "ready";
}

export function aiGovernanceUnavailableMessage(_error: unknown): string {
  return "AI governance data is unavailable. Refresh the page or sign in again.";
}
