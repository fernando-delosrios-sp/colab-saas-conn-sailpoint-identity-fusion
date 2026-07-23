# Brainstorm: Cap Scoring Concurrency

## Context

Managed-account matching runs identity scoring via `scoreManagedAccounts` in `matchOutcomeDispatcher.ts`. Today it uses bare `Promise.all` over the full batch (`managedAccountsBatchSize`, default **100**). Each concurrent call runs CPU-heavy LIG3/Jaro/trigram comparisons against hundreds of identities.

Other fusion phases already cap parallel work at **12** via `getFusionParallelBatchSize` in `collections.ts`. Scoring is the outlier — peak memory and GC pressure scale with batch size, not with a dedicated throughput knob.

User question during exploration: "Wouldn't capping save resources but take longer?" Answer: in Node's single-threaded CPU-bound scoring, uncapped `Promise.all` does not buy real parallelism; it mostly increases in-flight object graphs and GC pauses. Total comparison work is unchanged; waves of 12 vs 100 concurrent tasks.

## Decision Chain

### Q1: What problem are we solving?

**Answer:** Unbounded scoring concurrency (effectively 100) causes memory spikes and inconsistent resource use vs other pipeline phases. Operators cannot tune scoring throughput independently from batch sizing.

### Q2: Should we reduce `managedAccountsBatchSize` instead?

**Answer:** No. Batch size controls how many accounts are grouped per outer loop iteration and progress yielding. Concurrency is a separate concern. Future throughput tuning should use a dedicated knob.

**Chosen:** Add `scoringMaxConcurrency` (default 12), separate from `managedAccountsBatchSize`.

### Q3: What implementation mechanism?

**Options considered:**

1. **Reuse `promiseAllBatched` with `getScoringMaxConcurrency`** (recommended)
   - Already used elsewhere; yields between waves; proven pattern
   - Aligns with fusion phase cap philosophy

2. **Reuse `getFusionParallelBatchSize` directly for scoring**
   - Simpler (no new config)
   - Rejected: couples scoring to fusion output batching; operators may want different values later

3. **Worker threads for true CPU parallelism**
   - Could improve wall-clock on multi-core
   - Rejected: large scope, new dependencies, not needed for this fix

**Chosen:** Option 1 — new `scoringMaxConcurrency` config + `getScoringMaxConcurrency()` helper + `promiseAllBatched` in both identity and deferred scoring loops.

### Q4: Default and bounds?

**Answer:** Default **12** (match fusion parallel cap). Clamp to `[1, min(batchSize, 50)]`. If unset/null, fall back to 12 — never to uncapped batch size.

### Q5: Scope of change?

**In scope:**
- `developerSettings.ts`, `config.ts`, `connector-spec.json`
- `collections.ts` — `getScoringMaxConcurrency`
- `matchOutcomeDispatcher.ts` — identity + deferred loops

**Out of scope:**
- Cheap non-match path (advisor plan 002)
- Changing `managedAccountsBatchSize` default
- Worker threads / algorithm changes

## Agreed Approach

Introduce developer setting `scoringMaxConcurrency` (default 12). Apply capped concurrency in `scoreManagedAccounts` for identity-phase and deferred-phase scoring using existing `promiseAllBatched`. Surface setting in connector-spec under Developer Settings.

## Design Trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Wall-clock may be neutral or slightly slower on hypothetical multi-core parallel scoring | Node scoring is CPU-bound on one thread; total work unchanged |
| New config surface for operators | Enables tuning without conflating batch size |
| Upper bound 50 is arbitrary safety cap | Can raise after benchmarks |

## Success Criteria

- `scoreManagedAccounts` never uses uncapped `Promise.all` for scoring loops
- Default effective concurrency is 12, not 100
- `npm run typecheck`, `npm test`, `npm run lint` pass
- Optional: one test with `batchSize=50`, `scoringMaxConcurrency=5` processes all accounts
