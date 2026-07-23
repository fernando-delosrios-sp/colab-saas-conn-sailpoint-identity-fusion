## Why

Managed-account identity scoring currently runs up to 100 concurrent comparison operations (via `Promise.all` over the full batch), while other fusion phases cap parallel work at 12. Scoring is CPU- and memory-intensive (LIG3, Jaro, trigram loops against hundreds of identities per account). Uncapped concurrency inflates peak memory and GC pressure without meaningful throughput gain on Node's single-threaded execution model. Operators also cannot tune scoring throughput independently from `managedAccountsBatchSize`.

## What Changes

**Scoring concurrency**
- From: `scoreManagedAccounts` uses uncapped `Promise.all` — effective concurrency equals `managedAccountsBatchSize` (default 100)
- To: Identity-phase and deferred-phase scoring use `promiseAllBatched` with a configurable cap (default 12)
- Reason: Align scoring resource profile with other pipeline phases; reduce memory spikes
- Impact: Non-breaking; default behavior becomes more conservative on concurrency only

**Developer configuration**
- From: No scoring-specific concurrency setting
- To: New `scoringMaxConcurrency` developer setting (default 12, clamped 1–50)
- Reason: Independent throughput knob without changing batch grouping semantics
- Impact: Non-breaking; new optional connector-spec field

## Capabilities

### New Capabilities

_(none — behavior extends existing match-outcome-dispatch capability)_

### Modified Capabilities

- `matching-service/match-outcome-dispatch`: Add requirements for capped scoring concurrency in identity and deferred scoring sweeps, and for the `scoringMaxConcurrency` developer setting contract (delta capability: `match-outcome-dispatch`)

## Impact

- **Code:** `developerSettings.ts`, `config.ts`, `collections.ts`, `matchOutcomeDispatcher.ts`, `connector-spec.json`
- **Tests:** Optional test in `matchOutcomeDispatcher` test suite; existing scoring-path tests must pass
- **Operations:** Lower default peak memory during large aggregations; operators may raise `scoringMaxConcurrency` if benchmarks justify it
- **Dependencies:** None
