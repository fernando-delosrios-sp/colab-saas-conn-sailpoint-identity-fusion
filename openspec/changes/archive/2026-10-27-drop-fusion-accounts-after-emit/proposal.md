## Why

During large-scale account aggregations with 100k+ identities and managed accounts, retaining full FusionAccount instances in memory throughout the Match sweep causes severe heap bloat and GC pauses. Each FusionAccount holds complete source layers, decision layers, and attribute snapshots. By introducing an opt-in toggle to stream accounts early, drop full FusionAccount objects, and retain only compact candidate records, peak memory during the match sweep is drastically reduced while preserving standard aggregation semantics and review form accuracy.

## What Changes

**Account Aggregation Output Lifecycle**
- From: All `FusionAccount` instances are buffered in `FusionRun` throughout all pipeline phases and streamed to ISC only during Phase 5 (Output).
- To: When `fusionDropAccountsAfterEmit` is enabled, assembled `FusionAccount` instances are converted to `ISCAccount`, emitted immediately via `res.send()`, and dropped from memory. Only un-emitted accounts stream in Phase 5.
- Reason: Eliminates holding tens of thousands of full `FusionAccount` instances in the heap during the CPU-intensive Match sweep.
- Impact: Non-breaking opt-in toggle under Advanced Options; default is `false`.

**Match Candidate Representation**
- From: `MatchingService.buildTrigramIndex` populates `blockingIdentityRoster` with full `FusionAccount` instances.
- To: `MatchingService` indexes lightweight `MatchCandidateRecord` objects containing `identityId`, `identityName`, and the projected union of attributes needed for matching, form generation, and aggregation reporting (`matchingRules ∪ fusionFormAttributes ∪ reportAttributes`).
- Reason: Decouples candidate scoring, review forms, and reporting from heavy `FusionAccount` objects, slashing candidate memory by 80–90%.
- Impact: Internal service seam improvement; transparent to callers.

**Automatic Match Outcome Dispatch**
- From: `handleExactMatch` directly mutates the in-memory `FusionAccount` associated with the target identity.
- To: When `fusionDropAccountsAfterEmit` is enabled and an auto-match occurs, the target identity is re-fetched via `fetchIdentityById`, the `FusionAccount` is re-assembled with the new managed account layer and updated definitions, and the resulting `ISCAccount` is emitted to ISC (last-write-wins).
- Reason: Enables dropping `FusionAccount`s early while ensuring auto-matched accounts are fully synthesized and updated in ISC.
- Impact: Non-breaking; only executes on auto-matches when the toggle is enabled.

## Capabilities

### Modified Capabilities
- `account-list-operation`: Supports early account emission and on-demand auto-match re-emission when `fusionDropAccountsAfterEmit` is enabled.
- `matching-service`: Accepts and scores against decoupled `MatchCandidateRecord` representations.
- `ubiquitous-language`: Formalizes canonical terms for Match Candidate Record and Early Account Emission.

## Impact

- **Configuration**: Adds `fusionDropAccountsAfterEmit` boolean toggle to `connector-spec.json` and `FusionConfig`.
- **Pipeline Orchestration**: Modifies `accountListPhases.ts` and `fusionService.ts` to support streaming emission during Phase 3 & 4.
- **Matching & Forms**: Updates `MatchingService`, `FormService`, and `FusionReportBuilder` to use `MatchCandidateRecord`.
- **ISC Integration**: Employs ISC last-write-wins streaming for auto-matched account updates.
