import { Button, Drawer, Field, Input, SectionCard } from "@evcp/ui";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { CreatorStatusMessage } from "@/shared";
import { useProjectDeletion } from "./use-project-deletion";

type ProjectDeletionConfirmationState = Pick<
  ReturnType<typeof useProjectDeletion>,
  | "confirmation"
  | "setConfirmation"
  | "isDeleting"
  | "errorMessage"
  | "errorTechnicalDetails"
>;

export function ProjectDeletionConfirmation({
  projectName,
  deletion
}: {
  projectName: string;
  deletion: ProjectDeletionConfirmationState;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border-danger/20 bg-danger-bg text-danger flex gap-2 border p-3 text-sm">
        <AlertTriangle size={18} aria-hidden="true" />
        There is no recovery after this operation.
      </div>
      <Field
        label={
          <>
            Type <strong>{projectName}</strong> to confirm
          </>
        }
        htmlFor="delete-project-confirmation"
      >
        <Input
          id="delete-project-confirmation"
          autoComplete="off"
          value={deletion.confirmation}
          onChange={(event) => deletion.setConfirmation(event.target.value)}
          disabled={deletion.isDeleting}
        />
      </Field>
      {deletion.errorMessage ? (
        <CreatorStatusMessage tone="danger" technicalDetails={deletion.errorTechnicalDetails}>
          {deletion.errorMessage}
        </CreatorStatusMessage>
      ) : null}
    </div>
  );
}

export function ProjectSettingsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const project = app.selectedProject;
  const deletion = useProjectDeletion({
    projectId: project.id,
    projectName: project.name,
    onDeleted: app.handleProjectDeleted
  });

  return (
    <>
      <CreatorShell
        app={app}
        content={
          <section className="admin-page-stack" aria-label="Project settings">
            <SectionCard title="Project information">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Name</dt>
                  <dd className="text-body font-medium">{project.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">Project ID</dt>
                  <dd className="text-body font-mono">{project.id}</dd>
                </div>
              </dl>
            </SectionCard>

            <section className="creator-danger-zone" aria-labelledby="delete-project-heading">
              <div>
                <h2 id="delete-project-heading">Delete project</h2>
                <p>
                  Permanently delete this project, its workspace, database, files, deployments,
                  and project history. This action cannot be undone.
                </p>
              </div>
              <div>
                <Button type="button" variant="danger" onClick={deletion.open}>
                  <Trash2 size={16} aria-hidden="true" /> Delete project
                </Button>
              </div>
            </section>
          </section>
        }
      />

      <Drawer
        open={deletion.isOpen}
        onClose={deletion.close}
        title={`Delete ${project.name}?`}
        description="This permanently removes the project and all resources owned by it."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={deletion.close}
              disabled={deletion.isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!deletion.canDelete || deletion.isDeleting}
              onClick={() => void deletion.deleteProject()}
            >
              <Trash2 size={16} aria-hidden="true" />
              {deletion.isDeleting ? "Deleting…" : "Delete project permanently"}
            </Button>
          </div>
        }
      >
        <ProjectDeletionConfirmation projectName={project.name} deletion={deletion} />
      </Drawer>
    </>
  );
}
