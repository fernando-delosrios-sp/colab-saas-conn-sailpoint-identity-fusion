# Discovery — instrument-account-list-refresh

## Scope

**In:** Refresh-phase (Phase 3) sub-step timing and workload counters inside `FusionService.processFusionAccount` and its direct callees; one aggregate DETAIL/METRIC emission at Refresh phase end; unit tests for counter aggregation and log shape.

**Out:** Process-phase instrumentation; raising fusion parallel batch size; changing Map/Define semantics; per-account INFO logging; tenant-specific config knobs.

## Language terms

| Term | Status |
|------|--------|
| **Phase** | promote — Refresh is Phase 3 of accountList |
| **Operation heartbeat** | promote — STATUS lines continue during Refresh |
| **Map** / **Define** | promote — sub-steps named `map` and `normalDefine` in metrics |
| **Bulk ingest** | conflicts-with-canonical — Refresh is not bulk ingest; do not reuse `ingested` unit |

## Decisions

- **Rationale:** Operators report ~200 Fusion accounts / 10s during Refresh with no visibility into whether time is spent in managed-account blending, Map, Normal Define, or unique registration. Existing instrumentation is only `refreshPhase.processFusionAccounts` (single METRIC) plus `recordRefreshedAccount` count on heartbeat.
- **Measurement strategy:** Accumulate **sums and counts** per sub-step across all accounts in the Refresh phase; emit **one** low-cardinality summary at phase end. Do **not** emit per-account METRIC lines (would flood logs at 18k+ accounts).
- **Sub-step buckets:** `prelude` (reviewer + identity/decision layers + origin scope), `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, `finalize`.
- **Timing:** Use `performance.now()` deltas inside `processFusionAccount`; add to `OperationRunContext` refresh metrics accumulator reset at Refresh phase start.

## Open questions

_(none — locked for apply)_

## Scenarios discussed for specs

- Refresh PHASE END includes refresh workload summary when accounts processed
- Sub-step counters increment only during Refresh phase
- Aggregate summary omitted when zero accounts processed
