import { Button, SectionCard, Table, THead, TRow, TCell } from "@evcp/ui";
import type { AiQuotaDto } from "@evcp/api-client";
import { quotaRows } from "./lib/derivations";

export function QuotaPanel({
  quotas,
  disabled,
  onEdit
}: {
  quotas: AiQuotaDto[];
  disabled: boolean;
  onEdit: (scope: AiQuotaDto["scope"]) => void;
}) {
  const rows = quotaRows(quotas);
  return (
    <SectionCard eyebrow="Budgets" title="Usage quotas">
      <Table>
        <THead>
          <TRow>
            <TCell>Scope</TCell>
            <TCell>Daily</TCell>
            <TCell>Monthly</TCell>
            <TCell>Hard stop</TCell>
            <TCell></TCell>
          </TRow>
        </THead>
        <tbody>
          {rows.map((row) => (
            <TRow key={row.scope}>
              <TCell>{row.scope}</TCell>
              <TCell>{row.quota ? row.quota.dailyLimit.toLocaleString() : "No limit set"}</TCell>
              <TCell>{row.quota ? row.quota.monthlyLimit.toLocaleString() : "—"}</TCell>
              <TCell>{row.quota?.hardStop ? "On" : "—"}</TCell>
              <TCell>
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onEdit(row.scope)}>
                  Edit
                </Button>
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
