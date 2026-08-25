import type { ProjectMutationFence } from "../project-lifecycle";
import type { GitPort } from "./git-port";

export async function withFencedCheckout<T>(input: {
  git: GitPort;
  projectId: string;
  targetCommit: string;
  originalCommit: string;
  fence?: ProjectMutationFence;
  operation: () => Promise<T>;
}): Promise<T> {
  await input.fence?.assertCurrent();
  let result: T | undefined;
  const failures: unknown[] = [];
  try {
    await input.git.checkoutCommit(input.projectId, input.targetCommit);
    await input.fence?.assertCurrent();
    result = await input.operation();
  } catch (error) {
    failures.push(error);
  }
  try {
    await input.fence?.assertCurrent();
    await input.git.checkoutCommit(input.projectId, input.originalCommit);
    await input.fence?.assertCurrent();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 1) throw new AggregateError(failures, "Publish checkout compensation failed");
  if (failures.length === 1) throw failures[0];
  return result as T;
}
