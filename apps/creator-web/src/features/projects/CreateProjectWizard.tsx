import { WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button, DecisionPanel, Field, Input, Select, Textarea } from "@evcp/ui";
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
          <Field label="Application type" htmlFor="cpw-app-type">
            <Input
              id="cpw-app-type"
              value={form.appType}
              onChange={(event) => onField("appType", event.target.value)}
            />
          </Field>
          <Field label="Target department" htmlFor="cpw-dept">
            <Input
              id="cpw-dept"
              value={form.targetDepartment}
              onChange={(event) => onField("targetDepartment", event.target.value)}
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
          <Field label="Intended users" htmlFor="cpw-users">
            <Input
              id="cpw-users"
              value={form.intendedUsers}
              onChange={(event) => onField("intendedUsers", event.target.value)}
            />
          </Field>
          <Field label="Data sensitivity" htmlFor="cpw-sensitivity">
            <Select
              id="cpw-sensitivity"
              value={form.dataSensitivity}
              onChange={(event) => onField("dataSensitivity", event.target.value)}
            >
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
              <option value="public">Public</option>
            </Select>
          </Field>
        </div>
        {technicalDetails ? (
          <CreatorStatusMessage tone="danger" technicalDetails={technicalDetails}>
            <strong>{message}</strong>
          </CreatorStatusMessage>
        ) : (
          <DecisionPanel
            tone="info"
            badge={isCreating ? "Creating" : "Ready"}
            title={message}
            lines={[
              "The project opens in its workspace after creation.",
              "Horizon uses the business problem to prepare the first draft.",
              "Project history remains available for later PRD review."
            ]}
          />
        )}
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
