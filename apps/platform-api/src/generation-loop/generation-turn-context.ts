import type { PlatformUser } from "../platform-services";
import type { GenerationServiceDeps } from "./generation-service-types";

// Governed context resolution for a turn, extracted from generation-service (size ratchet).
export async function resolveGovernedTurnContext(
  deps: Pick<GenerationServiceDeps, "resolveGovernedContext">,
  input: { actor?: PlatformUser; projectId: string }
) {
  if (!input.actor || !deps.resolveGovernedContext) return undefined;
  return deps
    .resolveGovernedContext({
      actor: input.actor,
      projectId: input.projectId,
      scenario: "frontend_coding"
    })
    .catch(() => undefined);
}
