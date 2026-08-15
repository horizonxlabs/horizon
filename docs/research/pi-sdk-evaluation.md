# Pi SDK evaluation for Horizon Coding AI

Date: 2026-08-14

## Decision

Adopt Pi behind a Horizon-owned adapter as the inner coding-agent harness. Do not replace Horizon's governance, workspace isolation, persistence, validation, checkpoint, preview, or publishing layers. Keep the existing generation engine available behind a feature flag until a production-shaped pilot passes.

## What Pi can replace

The Pi SDK is explicitly designed to embed Pi in other applications and custom interfaces. It provides the model/tool loop, streaming lifecycle events, custom tools, sessions and branching, compaction, skills, extensions, and provider/model abstraction. These capabilities can replace Horizon's custom completion/parser/retry portion and native action-markup protocol.

Pi supports OpenAI-compatible providers and custom provider implementations, so Horizon can retain LiteLLM as the internal model gateway. Horizon's governed executor must remain on every Pi model round so guardrails, quota reservation/reconciliation, fallback routing, cost, and evidence are not bypassed.

## What Horizon must keep

- Keycloak identity, tenant/project authorization, and user roles.
- PRD baseline, knowledge, governed skills, and policy context.
- Prisma chat/audit/evidence as the authoritative enterprise record.
- Per-project Docker workspace lifecycle and filesystem isolation.
- Restricted file/edit/shell adapters, transactional migrations, validation, Git commit, rollback, and immutable checkpoints.
- SSE/API compatibility, preview readiness, publishing, Store access, and operational recovery.

Pi documents that it has no built-in sandbox and that tools/extensions run with the Pi process's permissions. Therefore Horizon must disable Pi's built-in write/edit/bash tools in the Platform API and expose only custom tools backed by the existing Docker action runner. Project-local Pi extensions and resource auto-discovery must also be disabled or replaced by a Horizon-controlled `ResourceLoader`.

## Integration shape

1. Add `EVCP_AGENT_ENGINE=legacy|pi` and implement a Pi adapter with the current `history`, `listWorkspaceFiles`, and `runTurn` contract.
2. Create a Plan session without mutating tools and a Build session with Horizon custom tools only.
3. Map Pi text/thinking/tool lifecycle events to the existing Horizon SSE event contract.
4. Route every Pi LLM request through the governed executor and LiteLLM; use unique evidence/request IDs per model round.
5. Buffer proposed database migrations and apply them only through Horizon's existing transactional migration stage.
6. Keep Horizon's outer `prepare -> actions -> validate -> commit -> migrations -> checkpoint` transaction and restore behavior.
7. Treat Prisma history as authoritative. Do not rely on node-local Pi JSONL sessions for multi-replica durability without a separate persistence design.

## Risks and controls

- The current package is `@earendil-works/pi-coding-agent` 0.84.2, requires Node `>=22.19.0`, and is pre-1.0. Pin the exact version and hide it behind an internal adapter because the official changelog includes breaking changes in minor releases.
- Pi is MIT-licensed and permits commercial use and modification, subject to retaining the license notice.
- Directly pointing built-in tools at the Platform API host would expose the host filesystem and Docker socket. Use Horizon-owned custom tools only.
- Pi's session persistence does not by itself replace Horizon's multi-tenant Prisma ledger, replay, worker ownership, or audit requirements.

## Pilot acceptance criteria

- Generate and revise Todo List and Sales Pipeline projects through real LiteLLM.
- Preserve the existing Creator SSE UI without a frontend rewrite.
- Confirm no tool can access the Platform API host filesystem or another project workspace.
- Enforce guardrails and quotas for every Pi model round and persist evidence.
- Verify failed build and failed migration restore the last-known-good source and create no checkpoint.
- Verify restart/retry does not duplicate actions or commits.
- Compare completion success rate, first-token latency, total latency, token/cost usage, and preview-ready rate against the legacy engine.

## Primary sources

- [Pi SDK documentation](https://pi.dev/docs/latest/sdk)
- [Pi provider documentation](https://pi.dev/docs/latest/providers)
- [Pi custom provider documentation](https://pi.dev/docs/latest/custom-provider)
- [Pi security: no built-in sandbox](https://pi.dev/docs/latest/security#no-built-in-sandbox)
- [Pi containerization guidance](https://pi.dev/docs/latest/containerization)
- [Pi extensions documentation](https://pi.dev/docs/latest/extensions)
- [Pi coding-agent package metadata](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/package.json)
- [Pi coding-agent changelog](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md)
- [Pi MIT license](https://github.com/earendil-works/pi/blob/main/LICENSE)
