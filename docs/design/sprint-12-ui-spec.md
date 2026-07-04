# Sprint 12 UI Spec - Installer, Backup, Restore

## Intent

Sprint 12 Admin UI is an operations recovery control plane. It must show whether a private-server install can proceed through a first-run install wizard, whether setup is complete without exposing secrets, whether backups are encrypted and recoverable, whether PostgreSQL PITR metadata is ready, and whether the latest restore drill passed.

## Primary Surface

| Surface | Screen | Purpose |
| --- | --- | --- |
| Admin Console | Installer, Backup and Restore | One dashboard for preflight, setup, backup, PITR and restore drill evidence |

## Layout

```text
+--------------------------------------------------------------------------------+
| Installer, Backup and Restore                          [Run Preflight] [Drill] |
| Private-server readiness evidence for install and recovery                      |
+------------------+------------------+------------------+-----------------------+
| First-run Wizard | Setup Wizard     | Backup Schedule  | Restore Drill         |
| passed 9/9       | complete/masked  | enabled daily    | passed RPO/RTO        |
+------------------+------------------+------------------+-----------------------+
| Recovery Path    | Private-server install readiness                           |
| preflight        | 1. Preflight | 2. Setup | 3. Compose | 4. Migrate | 5. Health |
| setup config     +-------------------------------------------------------------+
| compose ready    | Setup Wizard              | Preflight Report               |
| backup schedule  | Domain/DB/storage/auth    | API/Admin/Creator/Store/...    |
| backup run       +-------------------------------------------------------------+
| PITR             | Backup Schedule           | Backup Runs                    |
| restore drill    | retention/encryption      | artifact/checksum/size/time    |
|                  +-------------------------------------------------------------+
|                  | PostgreSQL PITR           | Restore Drill                  |
|                  | WAL/base backup/RPO/RTO   | validation checks/report/audit |
+--------------------------------------------------------------------------------+
```

## Components

- `PageHeader` with actions for Run Preflight, Simulate Blocked Preflight and Run Restore Drill.
- `MetricCard` for Preflight Report, Setup Wizard, Backup Schedule and Restore Drill.
- `WorkflowRail` for first-run preflight -> setup config -> compose readiness -> migrate/seed -> verify health -> backup schedule -> backup run -> PITR -> restore drill.
- `SectionCard` for each evidence group.
- `install-wizard-panel` and `install-wizard-steps` for the first-run install stepper.
- `DataTable` for preflight checks, compose services, backup runs and restore validation checks.
- `DefinitionGrid` for setup summary, backup policy and PITR metadata.
- `DecisionPanel` for setup redaction and restore drill outcome.
- `ToneBadge` for pass/fail/enabled/ready statuses.
- `ServiceStrip` for installer report, setup audit, storage contract, PITR metadata and admin-only API readiness.

## Responsive Rules

- Desktop: 280px workflow rail plus two-column evidence grid.
- Mobile: one column; use `backup-restore-mobile-list` for dense preflight/run/check rows.
- Long artifact URIs, checksums, timestamps and audit IDs must wrap with `overflow-wrap: anywhere`.
- Do not use icon-only recovery actions; all actions keep visible text.

## States

| State | UI Behavior |
| --- | --- |
| Default | Shows pending first-run install wizard, latest setup, backup policy/run, PITR and restore drill evidence |
| Passed preflight | Success decision, report path and setup review state; install can proceed after setup review |
| Failed preflight | Danger/warning decision, actionable failed checks, install not marked ready |
| Missing backup policy | Empty section remains visible with configure action |
| Failed restore drill | Failed checks listed; recovery not marked successful; critical audit shown |
| Access denied | Admin-only denial via standard API error envelope |

## Acceptance Criteria

- [x] Admin UI includes `Installer, Backup and Restore`.
- [x] Admin UI includes a first-run install wizard with preflight, setup, compose, migrate/seed and health steps.
- [x] UI exposes `Preflight Report`, `Setup Wizard`, `Backup Schedule`, `Backup Runs`, `PostgreSQL PITR`, `Restore Drill` and `Recovery Evidence`.
- [x] UI uses `operations-recovery-shell`, `install-wizard-panel`, `install-wizard-steps` and `backup-restore-mobile-list` patterns.
- [x] Setup/backup evidence shows masked values or key references only.
- [x] Restore drill failure language does not imply successful recovery.
