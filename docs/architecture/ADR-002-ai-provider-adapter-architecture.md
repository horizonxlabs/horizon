# ADR-002: AI Provider Adapter Architecture

**Status:** Proposed  
**Date:** 2026-07-03  
**Deciders:** Product Owner, Software Architect, AI Admin, Security Admin

## Context

Production v1 uses external AI providers only, while still needing scenario routing, quotas, fallback, guardrails, usage logging, cost tracking, and future extensibility. The platform must support provider-specific differences without exposing those differences to Creator workflows or generated apps.

Related requirements: `FR-AI-001` to `FR-AI-006`, `FR-GRD-001` to `FR-GRD-005`, `AIGW-001` to `AIGW-010`, `SEC-002` to `SEC-004`, `SEC-011`.

## Decision

The AI Gateway will use a **Provider Adapter Architecture**. Core platform code will call a stable adapter contract for model discovery, request execution, usage parsing, error mapping, and optional streaming. Provider-specific behavior will live behind adapters.

Production v1 will support external providers through this adapter boundary. Local LLM support is explicitly not required for v1, but the adapter contract must not prevent future local providers.

## Options Considered

### Option A: Direct OpenAI-Compatible Client Only

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Cost | Low |
| Scalability | Medium |
| Team familiarity | High |

**Pros:** Fast to implement, good for early demos, fewer abstractions.

**Cons:** Provider-specific behavior leaks into platform logic, Azure/provider differences become messy, harder to add future providers safely.

### Option B: Provider Adapter Architecture

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Medium |
| Scalability | High |
| Team familiarity | Medium |

**Pros:** Keeps routing/guardrail/quota logic provider-neutral, supports future providers, creates a clear test contract.

**Cons:** Requires careful adapter interface design and more initial tests.

### Option C: Plugin Runtime for AI Providers

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Cost | High |
| Scalability | High |
| Team familiarity | Low to medium |

**Pros:** Maximum extensibility, possible third-party provider packages.

**Cons:** Over-engineered for v1, increases security review burden, requires plugin sandboxing and version governance.

## Trade-off Analysis

Provider adapters add modest complexity but protect the platform from hardcoding a single provider. A full plugin runtime is too much for production v1 because provider code handles secrets and AI traffic. The adapter contract gives enough extensibility while keeping provider implementations inside the trusted codebase.

## Consequences

- AI routing can choose provider/model/key by scenario and policy without changing Creator workflows.
- Provider errors must be normalized into platform error codes.
- Token/cost logging depends on adapter usage parsing and must handle missing provider metadata.
- Guardrail checks remain outside providers and run before and after provider calls.
- Adding new providers later requires adapter implementation, tests, and admin UI support.

## Action Items

1. [ ] Define the `AIProviderAdapter` interface.
2. [ ] Define normalized AI error codes: timeout, rate_limited, quota_exceeded, auth_failed, provider_unavailable, policy_blocked.
3. [ ] Define scenario routing data model and fallback policy.
4. [ ] Define quota and license checks before external provider calls.
5. [ ] Define adapter contract tests for every supported provider.
