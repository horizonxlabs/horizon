import { SectionCard } from "@evcp/ui";
import { CheckCircle2, ExternalLink, LoaderCircle } from "lucide-react";
import { CreatorState } from "@/shared";
import type { createVisibleDeployment } from "./publish-view";

function readableStatus(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PublishDeploymentCard({
  isPublishing,
  deployment
}: {
  isPublishing: boolean;
  deployment: ReturnType<typeof createVisibleDeployment>;
}) {
  const ready = deployment && ["published", "healthy", "deployed"].includes(deployment.status);
  const accessUrl = ready ? deployment.subdomainUrl || deployment.route : undefined;

  return (
    <SectionCard
      eyebrow={isPublishing ? "Publishing" : "Published output"}
      title={isPublishing ? "Your app is on its way" : "Latest deployment"}
    >
      <div aria-live="polite" aria-atomic="true">
        {isPublishing ? (
          <div className="creator-publish-progress" role="status">
            <span className="creator-publish-progress-icon" aria-hidden="true">
              <LoaderCircle size={28} className="creator-state-spinner" />
            </span>
            <strong>Building &amp; deploying your app</strong>
            <p>
              Preparing the production build, starting the deployment, and checking availability.
            </p>
            <span className="creator-publish-progress-note">
              This can take a few minutes. Your app link will appear here when it is ready.
            </span>
          </div>
        ) : deployment && ready ? (
          <div className="creator-published-output">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>Your app is ready</strong>
              <span>
                {readableStatus(deployment.environment)} · Manifest version{" "}
                {deployment.manifestVersion}
              </span>
              {accessUrl ? (
                <>
                  <a
                    className="button-link creator-published-open"
                    href={accessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open app <ExternalLink size={16} aria-hidden="true" />
                  </a>
                  <span className="creator-published-url">
                    <strong>{deployment.subdomainUrl ? "Primary access URL" : "Access URL"}</strong>
                    <a href={accessUrl} target="_blank" rel="noopener noreferrer" title={accessUrl}>
                      {accessUrl}
                    </a>
                  </span>
                </>
              ) : null}
              {deployment.subdomainUrl && deployment.route ? (
                <span className="creator-published-url">
                  <strong>Fallback path</strong>
                  <a href={deployment.route} target="_blank" rel="noopener noreferrer">
                    {deployment.route}
                  </a>
                </span>
              ) : null}
              <small title={deployment.id}>Deployment {deployment.id}</small>
            </div>
          </div>
        ) : (
          <CreatorState
            kind={deployment ? "unavailable" : "empty"}
            title={deployment ? "Deployment is not ready" : "No published deployment yet"}
            description={
              deployment
                ? `Deployment status: ${readableStatus(deployment.status)}.`
                : "Publish your app to get a link you can open and share."
            }
          />
        )}
      </div>
    </SectionCard>
  );
}
