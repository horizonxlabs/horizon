import { useRef } from "react";

export type ProjectRequestGuard = Readonly<{
  generation: number;
  projectId: string;
}>;

export function useProjectRequestGuard(initialProjectId?: string) {
  const generationRef = useRef(0);
  const activeProjectIdRef = useRef<string | undefined>(initialProjectId);

  function capture(projectId: string): ProjectRequestGuard | undefined {
    if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId) return undefined;
    activeProjectIdRef.current = projectId;
    return { generation: generationRef.current, projectId };
  }

  function isCurrent(guard: ProjectRequestGuard): boolean {
    return (
      guard.generation === generationRef.current &&
      guard.projectId === activeProjectIdRef.current
    );
  }

  function reset() {
    generationRef.current += 1;
    activeProjectIdRef.current = undefined;
  }

  return { capture, isCurrent, reset };
}
