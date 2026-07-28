# Brainstorm: Deferred sequential drain

## Context

Observed bug on second `accountList` run with deferred matching enabled:

- Run 1 (36 managed accounts, 0 fusion accounts): 27 deferred, ~10 Fusion accounts created.
- Run 2 (10 persisted fusion accounts, 27 remaining managed): 27 deferred again, 0 new non-matches, ~9 accounts output — no progress.

Log evidence: `registry total=27`, `avgPoolSize=27.0`, `deferredMatched=27`, `matches(0n/0m/0a/27d)`.

Root cause: current `MatchOutcomeDispatcher.scoreManagedAccounts` uses a **frozen two-pass** model:

1. Pass 1 registers **all** unmatched accounts into `CandidateRegistry`.
2. Pass 2 scores **all** pending accounts against the frozen pool in parallel.
3. Similar accounts form cliques — every account matches peers, all defer, no anchors materialize.

This regressed behavior from the pre-2026-07-18 design, which used sequential Phase B **because candidate registration was interleaved with scoring**. The 2026 refactor claimed parallel Pass 2 was behavior-neutral; it is not for clique clusters.

Current `handleDeferredMatch` only claims the incoming account; it does not materialize matched pending candidates.

## Q1: What should happen when an account is evaluated?

**User answer (implicit from description):**

- No match → materialize as Fusion account (non-match anchor).
- Match → hold back incoming account (deferred), report deferred match.

## Q2: What happens to matched candidates?

**User answer:** All matched **pending** candidates should be materialized as Fusion accounts and removed from the deferred pool. Persisted fusion accounts from prior runs are already materialized — do not re-materialize.

## Q3: Can deferred resolution be parallelized?

**Analysis:**

| Stage | Parallel? |
|-------|-----------|
| Identity scoring | Yes (unchanged) |
| Deferred drain per source | No — pool mutates after each account |
| Across sources | Yes |
| Within source disconnected clusters | Optional future optimization |

"Score parallel, dispatch sequential" against a snapshot is **insufficient** — clique members all match before any anchor exists.

## Approaches considered

### A. Tier-based peer-only heuristic (rejected)

When persisted seeds exist, treat peer-only deferred matches as non-match. Fixes run-2 stall partially but does not establish anchors within run 1 cliques; does not match user's materialization model.

### B. Sequential drain with anchor materialization (recommended)

Per source, deterministic order (managedKey sort):

1. Seed pool from persisted fusion accounts.
2. For each pending account: score vs current pool.
3. No deferred match → materialize incoming as anchor.
4. Deferred match → claim incoming; materialize **all** matched pending candidates; remove from queue/pool.

Identity scoring remains parallel; deferred drain sequential per source; sources parallelizable.

### C. Graph clustering + parallel component drain (deferred)

Partition pending accounts into similarity connected components; drain each in parallel. Higher complexity; only if profiling requires it.

## Decision

**Adopt approach B.**

Materialization scope: **all matched pending candidates** in `fusionMatches` (user confirmed).

Ordering: deterministic `managedKey` sort for reproducibility.

## Success criteria

- Clique of N similar accounts with empty pool → 1 non-match + (N−1) deferred, not N deferred.
- Two-run scenario: run 2 creates new non-match Fusion accounts for accounts that do not match persisted anchors.
- Existing same-sweep pair test (first non-match, second deferred) continues to pass.
- Identity-phase concurrency cap unchanged.

## Open items resolved

- Persisted seed must include `fusionIdentityMap` entries (accounts with `identityId` miss `fusionAccountMap` seeding today).
- Registry keys should prefer `originAccount` composite key to align persisted reload with pending managed keys.
- Revert archived claim that parallel Pass 2 is behavior-neutral for deferred matching.
