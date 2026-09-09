import { createErrorTag, isPlatformFile, type ErrorTag } from "./error-tags";

export async function collectPostTurnTags(
  service: {
    probeRuntime?: (projectId: string) => Promise<{ status: number; errors: string[] }>;
    templateLockedFiles?: string[];
  },
  projectId: string,
  turnErrors: string[]
): Promise<ErrorTag[]> {
  const tags = turnErrors.filter(Boolean).map((message) => createErrorTag("build", message));
  const probe = await service.probeRuntime?.(projectId).catch(() => undefined);
  for (const message of probe?.errors ?? []) {
    const file = message.match(/(?:\.\/)?((?:app|components|lib)\/[\w./-]+)/)?.[1];
    const tag = createErrorTag("runtime", message, file);
    if (file && isPlatformFile(file, service.templateLockedFiles ?? [])) tag.platformBug = true;
    tags.push(tag);
  }
  return tags;
}
