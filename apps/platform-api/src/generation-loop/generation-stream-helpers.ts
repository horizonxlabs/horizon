// Governed context is resolved server-side. Pi sees only approved names/descriptions and loads
// full skill instructions through the bounded load_governed_skill tool.
export interface GovernedContext {
  availableSkills: Array<{ name: string; description: string }>;
  skillInstructions: Record<string, string>;
  knowledgeExcerpts: string[];
  productSpec?: string;
}
