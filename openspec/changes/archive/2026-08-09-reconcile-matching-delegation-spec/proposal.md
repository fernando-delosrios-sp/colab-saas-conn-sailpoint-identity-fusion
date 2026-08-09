## Why

The spec drift audit flagged matching delegation as high severity because `fusion-service/spec.md` still requires `MatchingService.processUncorrelatedManagedAccounts` and full sweep ownership by MatchingService — an incomplete July 2026 refactor target. Production code already implements a three-layer model (FusionService pipeline → MatchOutcomeDispatcher → MatchingService scoring) documented in `match-outcome-dispatch/spec.md`. Stale specs mislead agents and reviewers. Aligning living specs with code closes the gap without behavioral risk.

## What Changes

**FusionService matching delegation**
- From: FusionService delegates all matching to MatchingService entry points; MatchingService owns sweep orchestration
- To: FusionService owns managed-account pipeline phases (init, correlated sweep, record unique registration, uncorrelated drain); delegates match outcome dispatch to `MatchOutcomeDispatcher.runMatchSweep()`; may call MatchingService scoring-prep methods during init
- Reason: Matches shipped architecture; correlated sweep is correlation/pipeline domain
- Impact: Spec-only; non-breaking

**MatchOutcomeDispatcher sweep contract**
- From: FusionService calls `runMatchSweep` exactly once per sweep (ambiguous for correlated vs uncorrelated)
- To: Uncorrelated sweep = one batch `runMatchSweep`; correlated sweep = per-account `runMatchSweep` calls orchestrated by FusionService
- Reason: Matches code (`processManagedAccount` vs `runUncorrelatedManagedAccountSweep`)
- Impact: Spec-only

**MatchingService role**
- From: Owns ManagedAccountMatchingRunner, CandidateRegistry, and two-sweep orchestration
- To: Provides scoring algorithms and trigram blocking; `MatchOutcomeDispatcher` owns two-sweep lifecycle; deferred candidate state on FusionRun
- Reason: `ManagedAccountMatchingRunner` was replaced by MatchOutcomeDispatcher
- Impact: Spec-only

**captureBreakdown API**
- From: `MatchingService.setCaptureBreakdown(value)`
- To: `MatchingService.configureScoring({ captureBreakdown })`
- Reason: Matches code
- Impact: Spec-only

**Ubiquitous language**
- From: `ManagedAccountMatchingRunner` cited as canonical; maps from `ManagedAccountPassRunner`
- To: `ManagedAccountMatchingRunner` retired; `MatchOutcomeDispatcher` is canonical for match sweep / outcome dispatch
- Reason: Type does not exist in code
- Impact: Spec-only

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `fusion-service`: Replace MatchingService delegation requirement with three-layer pipeline + MatchOutcomeDispatcher contract
- `matching-service`: Clarify scoring vs orchestration split; retire ManagedAccountMatchingRunner references; align configureScoring API
- `matching-service/match-outcome-dispatch`: Clarify correlated vs uncorrelated sweep invocation patterns
- `ubiquitous-language`: Retire ManagedAccountMatchingRunner; update canonical type examples

## Impact

- **Code**: None (spec/docs only)
- **Specs**: `openspec/specs/fusion-service/spec.md`, `openspec/specs/matching-service/spec.md`, `openspec/specs/matching-service/match-outcome-dispatch/spec.md`, `openspec/specs/ubiquitous-language/spec.md`
- **Verification**: `openspec validate --all --json`; optional ripgrep audit that no living spec requires `MatchingService.processUncorrelatedManagedAccounts` or `ManagedAccountMatchingRunner` as active API
