## Context

Trigram blocking reduces identity comparisons by indexing mandatory attributes. Two defects: (1) threshold-0 mandatory attributes are indexed but cannot safely filter; (2) accounts missing all indexed mandatory values trigger a full identity corpus scan despite guaranteed non-match.

Drift check: `git rev-parse --short HEAD` → `25acd10` at package authoring time.

## Goals / Non-Goals

**Goals:**
- Index only mandatory rules with `(fusionScore ?? 0) > 0`.
- Return empty `Set` when account lacks all indexed mandatory values (use `missing()` same as scorer).
- Add `mandatoryMissingBlockCount` on FusionRun; wire epilogue in `accountListPhases.ts`.
- Stop incrementing `fullScanFallbackCount` for the mandatory-missing case.
- Regression: threshold-0 mandatory attribute not indexed; identity without that attr still reachable.

**Non-Goals:**
- Skip-on-missing for mandatory rules.
- Per-attribute operator config changes.

## Decisions

### D1: Index eligibility

```typescript
const indexableMandatory = matchingConfigs.filter(
    (c) => c.mandatory === true && (c.fusionScore ?? 0) > 0
)
```

If empty, `indexedMandatoryAttributes` is empty and `getCandidates` returns `undefined` (legacy full-scan when no blocking).

### D2: Empty set branch

When index is built, `indexedMandatoryAttributes.length > 0`, and account has no non-missing value for any indexed attribute:

- Return `new Set()` (not `undefined`).
- Increment `mandatoryMissingBlockCount`.
- Throttled warn log (reuse or mirror fullScanFallback throttling pattern with distinct message).

### D3: Dispatcher

```239:241:src/services/matchingService/matchOutcomeDispatcher.ts
        const candidateSet = matchingService.getCandidates(fusionAccount, log, excludeIds)
        const identityPool: Iterable<FusionAccount> =
            candidateSet ?? (excludeIds ? run.fusionIdentitiesExcluding(excludeIds) : run.allFusionIdentities)
```

Empty set is truthy — `??` does not fall through; `scoreFusionAccount` iterates zero identities. No dispatcher code change required if `getCandidates` returns empty Set; add test to lock behavior.

## Current state (excerpts)

Indexes all mandatory rules:

```241:250:src/services/matchingService/matchingService.ts
        const mandatoryConfigs = this.matchingConfigs.filter((c) => c.mandatory === true)
        ...
        for (const config of mandatoryConfigs) {
            const idx = buildAttributeIndex(identityArray, config.attribute)
```

Returns undefined and increments fullScanFallbackCount:

```295:306:src/services/matchingService/matchingService.ts
        if (resultSet === undefined) {
            ...
            this.run.fullScanFallbackCount = (this.run.fullScanFallbackCount ?? 0) + 1
            ...
            return undefined
        }
```

Mandatory never skips missing:

```153:157:src/model/config.ts
export function effectiveSkipMatchIfMissing(...): boolean {
    return !matching.mandatory && matching.skipMatchIfMissing !== false
}
```

## In scope

- `matchingService.ts` (`buildTrigramIndex`, `getCandidates`)
- `fusionRun.ts`
- `accountListPhases.ts`
- Tests and docs listed in tasks.md
- Spec deltas: `matching-service`, `match-outcome-dispatch`, `fusion-run`, `account-list-operation`

## Out of scope

- Numeric scorers, name-matcher caches
- Changing trigram intersection algorithm

## STOP conditions

- Re-read `effectiveSkipMatchIfMissing` and scorer `isMatch` lines: if mandatory can pass with missing value when threshold > 0, stop — empty-set short-circuit is unsound.
- Threshold-0 mandatory indexing change causes form/report score regression on tenants using that config — document in changelog as behavior fix.

## Verification commands

```bash
npx vitest run src/services/matchingService/__tests__/matchService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts
npm run test:scenario
npm run lint
```

## Git workflow

Independent of other perf packages; may apply in parallel.

## Risks / Trade-offs

[MED] Tenants relying on threshold-0 mandatory trigram blocking may see more candidates scored → correctness fix, possible CPU increase for that misconfiguration.

[LOW] Counter rename in epilogue — document in observability.md.
