import type { AiScenario, PlatformApiServices, PlatformUser } from "../platform-services";
import type { GovernedContext } from "./generation-stream-helpers";
import type { ErrorTag } from "./error-tags";

// Turns a project's governed skill assignment + knowledge scope into the generation prompt context.
// Reuses the same in-memory governance services as the admin console (hydrated from Postgres at
// boot), so a skill an admin assigns and knowledge they approve reach the AI during generation.
// Skills follow opencode-style progressive disclosure: only the resolved skill's name + description
// are surfaced up front; its full instructions are loaded on demand when the model requests them.
export function createGovernedContextResolver(services: Pick<PlatformApiServices, "skills" | "knowledge" | "prds">) {
  return async (input: {
    actor: PlatformUser;
    projectId: string;
    scenario: AiScenario;
  }): Promise<GovernedContext> => {
    const availableSkills: Array<{ name: string; description: string }> = [];
    const skillInstructions: Record<string, string> = {};
    try {
      const resolved = services.skills.resolve(input.actor, {
        projectId: input.projectId,
        agentRole: "frontend_developer",
        scenario: input.scenario
      });
      if (resolved.skill && resolved.version) {
        availableSkills.push({ name: resolved.skill.key, description: resolved.skill.description || resolved.skill.name });
        skillInstructions[resolved.skill.key] = resolved.version.instruction;
      }
    } catch {
      // No approved+assigned skill for this role/scenario — generation proceeds without one.
    }

    let knowledgeExcerpts: string[] = [];
    try {
      const retrieval = services.knowledge.retrieve(input.actor, {
        projectId: input.projectId,
        agentRole: "frontend_developer",
        scenario: input.scenario,
        query: input.projectId
      });
      knowledgeExcerpts = retrieval.sources.flatMap((source) => source.excerpts);
    } catch {
      // No permitted knowledge in scope — generation proceeds without it.
    }

    // PRD is deliberately OUT of the generation loop for now (context lean-down): the chat
    // history carries the project's memory instead. The PRD tab stays for manual use; the
    // spec injection can return here when the loop needs it again.
    return { availableSkills, skillInstructions, knowledgeExcerpts };
  };
}

// Audit sink for platformBug error tags (template defects hit by real users) — kept out
// of app-factory, which is size-ratcheted and may only shrink.
export function createPlatformBugAuditor(audit: {
  record(entry: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    severity?: string;
    metadata?: Record<string, unknown>;
  }): unknown;
}): (projectId: string, tag: ErrorTag) => void {
  return (projectId, tag) =>
    audit.record({
      actorId: "system",
      action: "generation.platform_bug_suspected",
      resourceType: "workspace_container",
      resourceId: projectId,
      severity: "warning",
      metadata: { signature: tag.signature, file: tag.file, message: tag.message.slice(0, 300) }
    });
}
