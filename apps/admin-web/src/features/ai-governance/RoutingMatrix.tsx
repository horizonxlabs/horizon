import { Button, SectionCard, Table, THead, TRow, TCell } from "@evcp/ui";
import type { AiProviderDto, AiScenarioDto, AiScenarioRouteDto } from "@evcp/api-client";
import { routingMatrixRows } from "./lib/derivations";

export function RoutingMatrix({
  routes,
  providers,
  disabled,
  onConfigure
}: {
  routes: AiScenarioRouteDto[];
  providers: AiProviderDto[];
  disabled: boolean;
  onConfigure: (scenario: AiScenarioDto) => void;
}) {
  const rows = routingMatrixRows(routes, providers);
  return (
    <SectionCard eyebrow="Routing" title="Scenario routing">
      <Table>
        <THead>
          <TRow>
            <TCell>Scenario</TCell>
            <TCell>Primary</TCell>
            <TCell>Fallback</TCell>
            <TCell></TCell>
          </TRow>
        </THead>
        <tbody>
          {rows.map((row) => (
            <TRow key={row.scenario}>
              <TCell>{row.scenario}</TCell>
              <TCell>{row.primary ? `${row.primary.name} · ${row.primary.model}` : "Not configured"}</TCell>
              <TCell>{row.fallback ? `${row.fallback.name} · ${row.fallback.model}` : "—"}</TCell>
              <TCell>
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onConfigure(row.scenario)}>
                  Configure
                </Button>
              </TCell>
            </TRow>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
