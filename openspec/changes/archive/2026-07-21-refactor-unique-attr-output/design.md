## Context
The system recently introduced an "early send" mechanism via `streamAndClearEligibleAccounts` in Phase 5 (`uniqueAttributesPhase`) of the `corePipeline`. This allowed us to mitigate OOM risks by sending accounts that do not need unique attribute generation immediately, removing them from memory.

However, this created a bifurcated output architecture: some accounts are streamed in Phase 5, and the rest are generated and held until Phase 6 (`outputPhase`) where they are finally serialized and sent. This bifurcation is complex and breaks the uniformity of the output stream.

## Goals / Non-Goals
**Goals:**
- Eliminate the `uniqueAttributesPhase` (Phase 5) from the pipeline.
- Implement unique attribute generation as a Just-In-Time (JIT) complementary step during the `outputPhase`.
- Guarantee that all accounts are processed through a single, uniform output stream.
- Maintain existing OOM protection by instantly clearing accounts post-send.

**Non-Goals:**
- Do not refactor how unique attributes are logically generated or how templates evaluate.
- Do not alter Dry-Run behavior or single-account read behavior to accidentally burn uniqueness counters.

## Decisions

### D1: Merge Unique Attribute Generation into Output Phase
- **Choice:** Remove `streamAndClearEligibleAccounts` and `uniqueAttributesPhase`. Instead, evaluate unique attributes right before an account is serialized in the `sendAccountsToPlatform` stream.
- **Rationale:** This simplifies the pipeline flow significantly. Every account takes the exact same path to the platform, making the process perfectly sequential and true to a stream architecture.
- **Alternative Considered:** Keeping Phase 5 but using a different cache. Rejected because it doesn't solve the core awkwardness of having two different "send" locations in the pipeline.

### D2: Placement of the JIT Generation
- **Choice:** Call `refreshUniqueAttributes(account)` inside the `sendAccountsToPlatform` mapping loop, immediately *before* calling `getISCAccount(account)`.
- **Rationale:** `getISCAccount` is used globally across different modes (dry-run, account read). Modifying `getISCAccount` directly would risk leaking stateful uniqueness counter increments outside of aggregations. Placing the JIT step explicitly inside the aggregation's `sendAccountsToPlatform` phase keeps the side-effects correctly scoped.
- **Alternative Considered:** Embedding `refreshUniqueAttributes` directly into `getISCAccount`. Rejected due to the high risk of unintentionally burning counters during single-account reads or dry-runs.

## Risks / Trade-offs

[Risk] Stateful counters could increment in non-aggregation scenarios if we aren't careful where the JIT hook is placed.
-> Mitigation: Keep `getISCAccount` pure. Wrap the JIT logic exclusively in `sendAccountsToPlatform` or a specialized output phase iterator.

[Trade-off] We iterate over all accounts in `sendAccountsToPlatform` and synchronously invoke generation logic before serialization, which may slightly delay the first byte of output compared to the "early send" approach.
-> Accepted: The architectural purity and simplification of the pipeline heavily outweigh a micro-optimization on time-to-first-byte.

## Migration Plan

1. Modify `sendAccountsToPlatform` (or `forEachISCAccount`) to accept a hook/callback for JIT processing, or simply inject the `refreshUniqueAttributes` logic into the batch iteration.
2. Remove `uniqueAttributesPhase` and `streamAndClearEligibleAccounts` from `corePipeline`.
3. Verify test suites passing and dry-run execution behaves identically (no counters burned).

## Open Questions
- Should `forEachISCAccount` be the one invoking the JIT refresh, or should we create a specific aggregation wrapper function to manage this dependency clearly?
