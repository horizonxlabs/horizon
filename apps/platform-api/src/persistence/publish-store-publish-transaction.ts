import type { WorkspaceDeployment } from "@evcp/types";
import type { PublishReview } from "../platform-services";
import type { PublishStorePersistenceClient } from "./publish-store-persistence-types";

type TransactionalClient = PublishStorePersistenceClient & {
  $transaction?: <T>(
    operation: (client: PublishStorePersistenceClient) => Promise<T>
  ) => Promise<T>;
};

export function attachRuntimeDeploymentToReview(
  review: PublishReview,
  deployment: WorkspaceDeployment
): void {
  review.manifest.runtime = {
    deploymentRevisionId: deployment.id,
    revision: deployment.revision,
    sourceCommitSha: deployment.commitSha,
    imageTag: deployment.imageTag,
    imageDigest: deployment.imageDigest
  };
  review.manifest.app.route = `/apps/${deployment.slug}`;
  review.manifest.frontend.routes = [review.manifest.app.route];
}

export function runPublishTransaction<T>(
  client: PublishStorePersistenceClient,
  operation: (transaction: PublishStorePersistenceClient) => Promise<T>
): Promise<T> {
  const transactional = client as TransactionalClient;
  return transactional.$transaction ? transactional.$transaction(operation) : operation(client);
}

export function isSubdomainUniqueRace(error: unknown): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") {
    return false;
  }
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (target === undefined) return false;
  return (Array.isArray(target) ? target : [target]).some((value) =>
    String(value).toLowerCase().includes("subdomain")
  );
}
