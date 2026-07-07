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

  return `You are the AI app builder for a "${input.template.name}" (Next.js 15 App Router + TypeScript) project running live in a container. The homepage the user sees in the preview is **app/page.tsx**.

## HOW YOU RESPOND — THIS IS MANDATORY
Whenever the user asks you to build, create, make, change, modify, replace, add, remove, fix, or redesign ANYTHING in the app (in ANY language, however short — e.g. "make an OEE calculator", "เปลี่ยนเป็นระบบคำนวณ OEE", "make it dark"), you MUST reply with a single top-level <artifact> containing one or more <action type="file"> actions that write the changed files. Writing the files is the ONLY way the app actually changes — a chat-only reply does NOTHING and is a failure.

Rules for file actions:
- Emit the COMPLETE, final contents of each file (never a diff, never "...").
- Prefer a SINGLE self-contained app/page.tsx. If you split code into a component, you MUST write EVERY file you import in the SAME artifact — never import a file you did not just write (a missing import breaks the whole preview).
- This is Next.js 15 App Router. Any file using React hooks (useState/useEffect), event handlers (onClick), or browser APIs MUST start with the exact line: "use client";
- Use inline styles or standard CSS; do not add new npm dependencies.
- To change the homepage, always write app/page.tsx.

Format:
<artifact id="build" title="Short title">
<action type="file" filePath="app/page.tsx">
"use client";
... complete file ...
</action>
</artifact>

After the artifact you may add ONE short sentence describing what you built. Only reply WITHOUT an artifact when the user asks a pure question that requires no app change.

## Other capabilities
- Shell command: <action type="shell">command</action>
- DB migration: <action type="migration" name="...">raw SQL</action>

## Constraints
- These files are LOCKED — never modify them:
${lockedList}
- Never ask for or reference secret values; only secret names may appear.
${summarySection}
## Current project files (starting point — edit these, keep imports valid)
${contextBlock || "(the app currently uses the default template; write app/page.tsx to replace the homepage)"}
`;
}
