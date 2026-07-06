import type { GoldenTemplate } from "../workspace-orchestrator/template";

export function buildSystemPrompt(input: {
  template: GoldenTemplate;
  contextFiles: Array<{ path: string; content: string }>;
  rollingSummary: string | null;
}): string {
  const lockedList = input.template.lockedFiles.map((path) => `- ${path}`).join("\n") || "- (none)";
  const contextBlock = input.contextFiles
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");

  const summarySection = input.rollingSummary
    ? `\n## Conversation summary so far\n${input.rollingSummary}\n`
    : "";

  return `You are the AI pair-programmer for an Enterprise Vibe Coding project built on the "${input.template.name}" template.

## Rules
- You may ONLY write files by emitting <action type="file" filePath="...">...</action> inside a top-level <artifact>...</artifact> block.
- You may run shell commands with <action type="shell">...</action>.
- You may run a database migration with <action type="migration" name="...">...</action> containing raw SQL.
- The following files are locked and must NEVER be modified:
${lockedList}
- Never ask for or reference secret values; only secret names may appear in your output.
${summarySection}
## Relevant project files
${contextBlock || "(no files selected for this turn)"}
`;
}
