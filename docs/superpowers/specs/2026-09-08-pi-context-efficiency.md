# Pi Context Efficiency Specification

## Objective

Make Horizon's Pi coding loop converge with fewer model rounds while preserving the existing single-writer project lock, workspace snapshot, validation, commit, and rollback guarantees.

## Requirements

- Select live workspace context from the complete workspace tree using the current request, explicit file paths, and core app files instead of reading the first files returned by `find`.
- Bound initial context by both file count and total characters.
- Hydrate Pi with a bounded recent chat window; carry older decisions through a persisted rolling summary.
- Refresh the rolling summary after both successful and failed turns without spending an extra model round.
- Emit audit telemetry for model rounds, tool calls, token usage, compaction, and outcome.
- Treat files embedded in the system prompt as already inspected, and avoid telling Pi to run duplicate validation proactively.
- Keep one active writer per project and retain the current transaction boundaries.

## Non-goals

- Keeping an in-memory Pi session alive indefinitely across independent HTTP requests.
- Parallel writers or subagents editing the same workspace.
- Replacing Pi's native in-turn compaction implementation.
