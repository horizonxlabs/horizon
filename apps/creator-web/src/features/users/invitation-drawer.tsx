import type { AppInvitationInput } from "@evcp/api-client";
import { Button, Field, Input, Select, Textarea } from "@evcp/ui";
import { UserPlus } from "lucide-react";
import { useRef, useState, type FormEvent, type RefObject } from "react";

const initialInvitation: AppInvitationInput = {
  email: "",
  roleKey: "employee",
  userType: "internal",
  note: ""
};

export function useInvitationDrawer({
  handleInviteUser,
  isInvitingUser
}: {
  handleInviteUser: (invitation: AppInvitationInput) => Promise<boolean>;
  isInvitingUser: boolean;
}) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitation, setInvitation] = useState<AppInvitationInput>(initialInvitation);
  const inviteTriggerRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  function handleInvitationField(field: keyof AppInvitationInput, nextValue: string) {
    setInvitation((current) => ({ ...current, [field]: nextValue }) as AppInvitationInput);
  }

  function openInvitation() {
    setIsInviteOpen(true);
  }

  function closeInvitation() {
    if (isInvitingUser) return;
    setIsInviteOpen(false);
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await handleInviteUser(invitation);
    if (!sent) return;
    setInvitation(initialInvitation);
    setIsInviteOpen(false);
  }

  return {
    isInviteOpen,
    invitation,
    inviteTriggerRef,
    emailInputRef,
    handleInvitationField,
    openInvitation,
    closeInvitation,
    submitInvitation
  };
}

export function InviteUserForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  emailInputRef
}: {
  value: AppInvitationInput;
  onChange: (field: keyof AppInvitationInput, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  emailInputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="rounded-card border-primary/15 bg-primary-soft border px-4 py-3">
        <strong className="text-primary-strong block text-sm">
          Grant app access by invitation
        </strong>
        <p className="text-muted mt-1 text-xs">
          The invitation is independent of PRD and workspace readiness.
        </p>
      </div>

      <Field
        label="Email address"
        htmlFor="invite-user-email"
        hint="Use the address the user signs in with."
      >
        <Input
          ref={emailInputRef}
          id="invite-user-email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@company.com"
          value={value.email}
          onChange={(event) => onChange("email", event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <Field label="App role" htmlFor="invite-user-role">
          <Select
            id="invite-user-role"
            aria-label="App role"
            value={value.roleKey}
            onChange={(event) => onChange("roleKey", event.target.value)}
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
          </Select>
        </Field>
        <Field label="User type" htmlFor="invite-user-type">
          <Select
            id="invite-user-type"
            aria-label="User type"
            value={value.userType}
            onChange={(event) => onChange("userType", event.target.value)}
          >
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Note"
        htmlFor="invite-user-note"
        hint="Visible to access reviewers and project administrators."
      >
        <Textarea
          id="invite-user-note"
          placeholder="Optional context for the invitation"
          value={value.note ?? ""}
          onChange={(event) => onChange("note", event.target.value)}
        />
      </Field>

      {value.userType === "external" ? (
        <p className="rounded-control border-warning/20 bg-warning-bg text-warning border px-3 py-2 text-xs">
          External invitations require approval before access becomes active.
        </p>
      ) : null}

      <div className="border-border mt-2 flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            className="max-md:min-h-11"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          className="max-md:min-h-11"
          disabled={isSubmitting || !value.email.trim()}
        >
          <UserPlus size={16} aria-hidden="true" />
          {isSubmitting ? "Sending invitation…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
