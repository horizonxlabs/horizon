import { WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button, DecisionPanel, Field, Input, Select, Textarea } from "@evcp/ui";
import type { CreateProjectFormState } from "@/shared/types";

export function CreateProjectWizard({
  form,
  onField,
  onSubmit,
  onClose,
  message,
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
            <span className="eyebrow">Create Project Wizard</span>
            <h2>สร้าง Project ใหม่</h2>
            <p>ระบบจะสร้าง project แล้วพาเข้า workspace ทันที — AI สร้าง PRD draft แรกให้เบื้องหลัง</p>
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
          <Field label="App type" htmlFor="cpw-app-type">
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
        <DecisionPanel
          tone={message.includes("failed") ? "danger" : "info"}
          badge={isCreating ? "Creating" : "Ready"}
          title={message}
          lines={[
            "POST /projects — แล้วเข้า workspace ทันที",
            "AI สร้าง PRD draft เบื้องหลัง (~2–3 นาที) ดูได้ที่ tab PRD",
            "เริ่มสั่ง build ได้เลยโดยไม่ต้องรอ"
          ]}
        />
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
