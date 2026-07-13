# Task 1 report: feature-first layout governance

## Scope

- Updated `docs/architecture/ADR-012-frontend-feature-first-governance.md`.
- Updated `docs/ARCHITECTURE.md`.
- Updated `scripts/quality/check-frontend-architecture.mjs`.
- Updated `tests/unit/frontend-architecture-governance.test.mjs`.

## Test-first evidence

Added the required ADR assertion:

```js
assert.match(adr, /Component state.*URL state.*Server state.*Global client state/s);
```

The required focused command was run before the policy was added and failed at that assertion because ADR-012 did not contain the four state-placement categories.

An additional red run confirmed the architecture guide also lacked the same state-placement policy and that the checker allowed a new `assets/` root, despite the documented target layout defining only `app`, `routes`, `features`, and `shared`.

## Implementation

- Both architecture documents now prescribe component, URL, server, and global client state placement in the same order.
- The architecture checker now permits only the four documented target roots for new React source.
- Governance tests cover the ADR policy, architecture-guide policy, and rejection of a new unsupported source root.

## Verification

Executed after implementation:

```text
node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs
# 7 tests passed, 0 failed

pnpm check:frontend-architecture
# [frontend-architecture] checks passed

git diff --check
# exited successfully with no output
```

## Concerns

None. Existing `docs/superpowers/plans/*.md` files are untracked user work and were not modified.
