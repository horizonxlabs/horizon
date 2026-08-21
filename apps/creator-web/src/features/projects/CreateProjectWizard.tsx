import { WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button, Field, Input, Textarea } from "@evcp/ui";
import type { CreateProjectFormState } from "@/shared/types";

export function CreateProjectWizard({
  form,
  onField,
  onSubmit,
  onClose,
  message: _message,
  isCreating
}: {
  form: CreateProjectFormState;
  onField: (field: keyof CreateProjectFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  message: string;
  isCreating: boolean;
}) {
  return (
    <div className="creator-dialog-backdrop" role="presentation">
      <form className="creator-project-dialog" onSubmit={onSubmit} aria-label="Create project wizard">
        <header>
          <div>
            <span className="eyebrow">New workspace</span>
            <h2>Create a new project</h2>
          </div>
          <Button
            className="creator-project-dialog-close"
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={isCreating}
          >
            Close
          </Button>
        </header>
        <div className="creator-project-form">
          <Field label="Project name" htmlFor="cpw-name">
            <Input
              id="cpw-name"
              required
              placeholder="e.g. Sales Operations Hub"
              value={form.name}
              onChange={(event) => onField("name", event.target.value)}
            />
          </Field>
          <Field label="Business problem" htmlFor="cpw-problem">
            <Textarea
              id="cpw-problem"
              required
              rows={5}
              placeholder="Describe the workflow, users, and the outcome you need."
              value={form.businessProblem}
              onChange={(event) => onField("businessProblem", event.target.value)}
            />
          </Field>
        </div>
        <footer>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isCreating}>
            <WandSparkles size={16} />
            {isCreating ? "Creating Project" : "Create Project"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
