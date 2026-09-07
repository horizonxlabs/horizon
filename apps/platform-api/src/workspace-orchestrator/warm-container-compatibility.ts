/** Validate an unowned hot allocation without returning or logging runtime environment values. */
export function isWarmContainerCompatible(
  container: { image: string; env: string[] },
  resourceKey: string,
  image: string
): boolean {
  if (container.image !== image || !Array.isArray(container.env)) return false;
  const previewBases = container.env.filter((entry) => entry.startsWith("EVCP_PREVIEW_BASE="));
  // Duplicate entries have ambiguous process-environment semantics, so never import that allocation.
  return (
    previewBases.length === 1 && previewBases[0] === `EVCP_PREVIEW_BASE=/preview/${resourceKey}`
  );
}
