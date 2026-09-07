import { WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button, Field, Input, Textarea } from "@evcp/ui";
import type { CreateProjectFormState } from "@/shared/types";
import { CreatorStatusMessage } from "@/shared";

export function CreateProjectWizard({
  form,
  onField,
  onSubmit,
  onClose,
  message,
  technicalDetails,
  isCreating
}: {
  form: CreateProjectFormState;
  onField: (field: keyof CreateProjectFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  message: string;
  technicalDetails?: string;
  isCreating: boolean;
}) {
  return (
    <div className="creator-dialog-backdrop" role="presentation">
      <form
        className="creator-project-dialog"
        onSubmit={onSubmit}
        aria-label="Create project wizard"
      >
        <header>
          <div>
            <h2>Create project</h2>
            <p>
              Describe the business need. Horizon will create the project and open its workspace.
            </p>
          </div>
          <Button variant="ghost" type="button" onClick={onClose} disabled={isCreating}>
            Close
          </Button>
        </header>
        <div className="creator-project-form">
          <Field label="Project name" htmlFor="cpw-name">
            <Input
              id="cpw-name"
              required
              value={form.name}
              onChange={(event) => onField("name", event.target.value)}
            />
          </Field>
          <div className="creator-project-form-wide">
            <Field label="Business problem" htmlFor="cpw-problem">
              <Textarea
                id="cpw-problem"
                required
                rows={4}
                value={form.businessProblem}
                onChange={(event) => onField("businessProblem", event.target.value)}
              />
            </Field>
          </div>
        </div>
        {technicalDetails ? (
          <CreatorStatusMessage tone="danger" technicalDetails={technicalDetails}>
            <strong>{message}</strong>
          </CreatorStatusMessage>
        ) : null}
        <footer>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isCreating}>
            <WandSparkles size={16} />
            {isCreating ? "Creating project…" : "Create project"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
