## Why

Trigram blocking currently indexes every mandatory matching attribute regardless of threshold. Mandatory rules with `fusionScore` unset or zero pass with score 0, so excluding identities that lack the attribute drops candidates that would match on other rules — a correctness bug. Separately, when a managed account has no value for any indexed mandatory attribute, `getCandidates` returns `undefined` and the dispatcher scores the entire identity corpus, even though mandatory rules cannot pass for any identity (missing values fail mandatory evaluation). That full scan is provably wasted CPU once only threshold-positive mandatory attributes are indexed.

## What Changes

**Index guard for mandatory trigram attributes**
- From: `buildTrigramIndex` indexes all rules with `mandatory === true`.
- To: Index only mandatory rules whose effective `fusionScore` is strictly greater than zero.
- Reason: Threshold-0 mandatory rules cannot eliminate candidates safely.
- Impact: `matchingService.ts` `buildTrigramIndex`; regression test.

**Empty candidate set when account lacks all indexed mandatory values**
- From: `getCandidates` returns `undefined` → dispatcher scores `allFusionIdentities`.
- To: Return empty `Set` → `scoreFusionAccount` performs zero comparisons.
- Reason: No identity can pass when every indexed mandatory attribute is missing on the account side.
- Impact: `getCandidates`, `matchOutcomeDispatcher` tests.

**Mandatory missing block counter**
- From: Same path incremented `fullScanFallbackCount` and triggered "full scan fallback" warnings.
- To: Increment `mandatoryMissingBlockCount`; process epilogue reports it separately from `fullScanFallbackCount`.
- Reason: Operator signal must not imply a full scan occurred when none did.

**Unchanged**
- `undefined` when trigram index is not built or no indexable mandatory attributes exist (caller still full-scans).
- Mandatory rules still evaluate missing values (never skipped via `effectiveSkipMatchIfMissing`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `matching-service`: Trigram index eligibility; empty set vs undefined; mandatory missing block counter.
- `match-outcome-dispatch`: Identity pool uses returned set including empty; full scan only on `undefined`.
- `fusion-run`: `mandatoryMissingBlockCount` field.
- `account-list-operation`: Process epilogue mentions mandatory missing block count when non-zero.

## Impact

- `src/services/matchingService/matchingService.ts`
- `src/services/matchingService/matchOutcomeDispatcher.ts`
- `src/model/fusionRun.ts`
- `src/operations/helpers/accountListPhases.ts`
- Tests: `matchService.test.ts`, `matchOutcomeDispatcher.test.ts`
- Docs: `docs/reference/observability.md`, match-flow reference

## Apply status

- **Status**: APPLIED
- **Depends on**: none
- **Issue**:
