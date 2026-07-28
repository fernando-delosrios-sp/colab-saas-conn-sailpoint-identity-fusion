## Context

`MatchOutcomeDispatcher.scoreManagedAccounts` implements identity scoring (Pass 1) then deferred scoring (Pass 2) for uncorrelated managed accounts. Pass 1 registers every deferred-enabled non-match into `CandidateRegistry` before Pass 2 begins. Pass 2 scores the full pending set against that frozen pool using batched parallelism.

This causes clique deadlock: N similar accounts all match each other, all defer, zero anchors. On a second aggregation run with persisted Fusion accounts, peer-only matching repeats with no new non-matches (`deferredMatched=27`, `0n` in logs).

The pre-2026-07-18 design used sequential Phase B because registration was interleaved with scoring. The parallel Pass 2 refactor assumed a frozen pool was behavior-neutral—it is not for deferred matching.

Stakeholders: operators running multi-pass dry-run/production aggregations with `deferredMatching: true` on authoritative sources.

## Goals / Non-Goals

**Goals:**

- Materialize anchor Fusion accounts during the deferred sweep so cliques produce 1 non-match + (N−1) deferred, not N deferred.
- On deferred match, materialize all matched **pending** candidates; claim incoming account.
- Seed pool with persisted fusion accounts from both `fusionAccountMap` and `fusionIdentityMap`.
- Keep identity-phase scoring parallel with existing `scoringMaxConcurrency` cap.
- Deterministic processing order per source (`managedKey` sort).

**Non-Goals:**

- Cross-source candidate pooling (unchanged—per-source only).
- Within-source connected-component parallel drain (future optimization).
- Changing identity/partial/exact match paths.
- Connector configuration or ISC output shape changes.

## Decisions

### D1: Sequential drain per source (not frozen parallel Pass 2)

- **Choice:** Replace register-all-then-score-all with a per-source queue drained one account at a time; pool mutates after each outcome.
- **Reason:** Anchor materialization requires prior accounts to be finalized before later accounts score. User confirmed this model.
- **Considered alternatives:** Tier-based peer-only heuristic (rejected—does not materialize anchors within run 1); parallel score + sequential dispatch (rejected—classification still sees full clique before anchors exist).

### D2: Materialize all matched pending candidates on deferred match

- **Choice:** When incoming account A defers, every deferred match whose candidate is still pending in the sweep queue becomes a non-match Fusion account and is removed from queue/registry.
- **Reason:** User confirmed "all matched pending candidates." Unblocks clique members from re-matching each other.
- **Considered alternatives:** Best match only (rejected by user); first-in-queue only (rejected).

### D3: Persisted candidates are never re-materialized

- **Choice:** Matches against persisted seeds (prior-run fusion accounts) defer the incoming account only; persisted rows stay in pool unchanged.
- **Reason:** They are already Fusion accounts on the platform.
- **Considered alternatives:** Re-register on each match (rejected—duplicate work, wrong semantics).

### D4: Registry key alignment via `originAccount`

- **Choice:** `CandidateRegistry` keys candidates by normalized `originAccount` composite key when present, else `managedKey`.
- **Reason:** Reloaded fusion rows use fusion `nativeIdentity` as `managedKey` but share `originAccount` with pending managed accounts—prevents overwrite and pool misses.
- **Considered alternatives:** Separate maps for persisted vs pending (rejected—tier on single map is sufficient).

### D5: Parallelism split

- **Choice:** Identity sweep parallel; deferred drain sequential per source; optional parallel across sources.
- **Reason:** Pool mutation creates read-after-write dependency within a source.
- **Considered alternatives:** Full parallel deferred (current—incorrect); component-parallel (deferred).

## Risks / Trade-offs

- [Risk] Processing order affects which clique member becomes the first anchor → Mitigation: deterministic `managedKey` sort; document in spec; acceptable—any anchor unblocks the cluster.
- [Risk] Sequential drain slower for large sources → Mitigation: pool shrinks as anchors materialize; identity phase dominates cost today; parallelize across sources.
- [Trade-off] Reverts parallel deferred Pass 2 within a source → Accepted: correctness over throughput for deferred resolution.
- [Risk] WIP tier-based heuristic in working tree conflicts with this design → Mitigation: remove `hasActionableDeferredCandidateMatches` tier logic during implementation; use drain semantics instead.

## Migration Plan

N/A — code-only behavior fix. Rollback is a git revert. No deployment or configuration migration.

**Verification:** Run clique test (3+ similar accounts → 1 non-match), two-run dry-run scenario (36 → 10 → progress on second pass), full `npm test` and `npm run lint`.

## Open Questions

None—all resolved during brainstorming (materialization scope: all matched pending candidates; ordering: deterministic managedKey).
