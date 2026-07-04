# Sprint 13 UI Spec - Observability and License

## Intent

Sprint 13 Admin UI is a production control dashboard. It must show whether the platform is observable, whether generated apps and queues are healthy, whether telemetry export is configured, whether an upgrade can proceed, whether rollback evidence exists, and whether the enterprise license allows or blocks privileged actions.

## Primary Surface

| Surface | Screen | Purpose |
| --- | --- | --- |
| Admin Console | Observability and License | One dashboard for service health, app health, telemetry, upgrade safety and license enforcement |

## Layout

```text
+--------------------------------------------------------------------------------+
| Observability and License                      [Export Health] [Validate License]|
| Production health, telemetry, upgrade safety and signed license enforcement      |
+------------------+------------------+------------------+-----------------------+
| Service Health   | Telemetry Export | License Valid.   | License Enforcement   |
| 8/8 healthy      | OTLP configured  | active/offline   | guarded               |
+------------------+------------------+------------------+-----------------------+
| Production Gate  | Service Health                                             |
| service health   | Service | Type | Status | Signal | Retention              |
| app health       +-------------------------------------------------------------+
| queue pressure   | Generated App Health       | Queue Backpressure          |
| telemetry export | app route/readiness        | queue depth/oldest/status   |
| upgrade check    +-------------------------------------------------------------+
| rollback report  | Telemetry Export           | Upgrade Compatibility       |
| license validate | metrics/logs/traces        | blocked checks/reasons      |
| license enforce  +-------------------------------------------------------------+
|                  | Rollback Report            | License Validation          |
|                  | from/to/status/window      | edition/limits/offline      |
|                  +-------------------------------------------------------------+
|                  | License Enforcement                                      |
|                  | action/decision/reason/data continuity                  |
+--------------------------------------------------------------------------------+
```

## Components

- `MetricCard` for Service Health, Telemetry Export, License Validation and License Enforcement.
- `WorkflowRail` for production gate steps.
- `SectionCard` for each evidence group.
- `DataTable` for service health, generated app health, queues, telemetry, upgrade checks and enforcement events.
- `DefinitionGrid` for rollback and license metadata.
- `DecisionPanel` for blocked upgrade explanation.
- `ToneBadge` for health, warning, block and allowed states.
- `ServiceStrip` for health dashboard, telemetry contract, upgrade gate, license guard and data continuity.

## Responsive Rules

- Desktop: 280px workflow rail plus two-column evidence grid.
- Mobile: one column; use `license-enforcement-mobile-list` for long enforcement rows.
- Long endpoints, report paths, timestamps and reasons must wrap with `overflow-wrap: anywhere`.
- Do not use icon-only production actions; all actions keep visible text.

## States

| State | UI Behavior |
| --- | --- |
| Default | Shows latest health, queue, telemetry, upgrade, rollback and license state |
| Degraded service | Warning/danger status remains visible in table and service strip |
| Upgrade blocked | Danger decision panel lists report and blocking reason evidence |
| License warning/grace | Warning KPI and validation details keep operations visible |
| License expired | Enforcement table blocks privileged actions while existing apps show continuity |
| Access denied | Admin-only API denial uses standard error envelope |

## Acceptance Criteria

- [x] Admin UI includes `Observability and License`.
- [x] UI exposes `Service Health`, `Generated App Health`, `Queue Backpressure`, `Telemetry Export`, `Upgrade Compatibility`, `Rollback Report`, `License Validation` and `License Enforcement`.
- [x] UI uses `observability-license-shell` and `license-enforcement-mobile-list` patterns.
- [x] License evidence shows fingerprint/offline metadata only, not plaintext secret material.
- [x] Enforcement copy states that existing data/apps are preserved.
