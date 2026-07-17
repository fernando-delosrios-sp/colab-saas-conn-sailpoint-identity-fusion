# FusionService Report Recording Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the size of the `FusionService` god object by extracting the managed-account analysis recording and report-account ID resolution logic into focused, testable modules.

**Architecture:** Introduce two small modules under `src/services/fusionService/`: `reportAccountResolver.ts` for pure account ID resolution and `managedAccountAnalysisRecorder.ts` for stateful recording into `AggregationTracker`. `FusionService` delegates to them, `fusionReportBuilder.ts` imports resolver functions directly, and the public API remains unchanged.

**Tech Stack:** TypeScript, Vitest, existing `AggregationTracker` and `fusionReportBuilder.ts` helpers.

## Global Constraints

- `FusionService` must remain the public API for all connector operations; internal delegation is fine.
- All existing `fusionService.test.ts` tests must pass without modification.
- New modules must be covered by focused unit tests.
- No behavior changes; this is a structural refactor only.
- Lint (`npm run lint`) and typecheck (`npm run typecheck`) must remain clean.

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/services/fusionService/reportAccountResolver.ts` | Resolve `FusionAccount` or managed-key to the ISC account ID used for report links. |
| `src/services/fusionService/managedAccountAnalysisRecorder.ts` | Record analysis results (matches, deferred matches, non-matches, failures) into `AggregationTracker`. |
| `src/services/fusionService/__tests__/reportAccountResolver.test.ts` | Unit tests for resolver functions. |
| `src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts` | Unit tests for recorder. |
| `src/services/fusionService/fusionService.ts` | Delegate to the new modules; remove extracted private methods. |
| `src/services/fusionService/fusionReportBuilder.ts` | Use `reportAccountResolver.ts` instead of receiving a callback from `FusionService`. |

---

## Task 1: Extract report account resolver

**Files:**
- Create: `src/services/fusionService/reportAccountResolver.ts`
- Create: `src/services/fusionService/__tests__/reportAccountResolver.test.ts`
- Modify: `src/services/fusionService/fusionService.ts:1234-1249`
- Modify: `src/services/fusionService/fusionReportBuilder.ts:14-27`
- Modify: `src/services/fusionService/fusionService.ts:1785-1802`

**Interfaces:**
- Consumes: `SourceService.resolveIscAccountIdForManagedKey(managedKey: string): string | undefined`
- Produces: `resolveReportAccountId(fusionAccount, sources) → string | undefined`; `resolveReportAccountIdValue(accountId, sources) → string | undefined`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { FusionAccount } from '../../model/account'
import { resolveReportAccountId, resolveReportAccountIdValue } from '../reportAccountResolver'

describe('reportAccountResolver', () => {
    const makeSources = (resolvedId?: string) =>
        ({ resolveIscAccountIdForManagedKey: vi.fn(() => resolvedId) }) as any

    it('prefers the account iscAccountId when present', () => {
        const account = { iscAccountId: 'isc-123', managedAccountId: 'src::nat-1' } as FusionAccount
        expect(resolveReportAccountId(account, makeSources())).toBe('isc-123')
    })

    it('resolves managedAccountId via sourceService when iscAccountId is missing', () => {
        const account = { iscAccountId: undefined, managedAccountId: 'src::nat-1' } as FusionAccount
        const sources = makeSources('resolved-isc')
        expect(resolveReportAccountId(account, sources)).toBe('resolved-isc')
        expect(sources.resolveIscAccountIdForManagedKey).toHaveBeenCalledWith('src::nat-1')
    })

    it('returns undefined when neither id is resolvable', () => {
        const account = { iscAccountId: undefined, managedAccountId: undefined } as FusionAccount
        expect(resolveReportAccountId(account, makeSources())).toBeUndefined()
    })

    it('resolves a raw account id value', () => {
        const sources = makeSources('resolved-isc')
        expect(resolveReportAccountIdValue('src::nat-1', sources)).toBe('resolved-isc')
        expect(sources.resolveIscAccountIdForManagedKey).toHaveBeenCalledWith('src::nat-1')
    })

    it('returns undefined for empty account id value', () => {
        expect(resolveReportAccountIdValue(undefined, makeSources())).toBeUndefined()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/fusionService/__tests__/reportAccountResolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { FusionAccount } from '../../model/account'
import { SourceService } from '../sourceService'

export function resolveReportAccountId(
    fusionAccount: FusionAccount,
    sources: SourceService
): string | undefined {
    const iscId = fusionAccount.iscAccountId
    if (iscId) return iscId
    const managedKey = fusionAccount.managedAccountId
    if (!managedKey) return undefined
    return sources.resolveIscAccountIdForManagedKey(managedKey)
}

export function resolveReportAccountIdValue(
    accountId: string | undefined,
    sources: SourceService
): string | undefined {
    if (!accountId) return undefined
    return sources.resolveIscAccountIdForManagedKey(accountId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/fusionService/__tests__/reportAccountResolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire resolver into FusionService**

In `src/services/fusionService/fusionService.ts`:
1. Import `resolveReportAccountId`, `resolveReportAccountIdValue` from `./reportAccountResolver`.
2. Replace the two private methods with thin wrappers that delegate:

```typescript
private resolveReportAccountId(fusionAccount: FusionAccount): string | undefined {
    return resolveReportAccountId(fusionAccount, this.sources)
}

private resolveReportAccountIdValue(accountId?: string): string | undefined {
    return resolveReportAccountIdValue(accountId, this.sources)
}
```

- [ ] **Step 6: Wire resolver into fusionReportBuilder**

In `src/services/fusionService/fusionReportBuilder.ts`:
1. Import `resolveReportAccountId` from `./reportAccountResolver`.
2. Import `SourceService` from `../sourceService`.
3. Replace the callback field with `sources: SourceService` in `FusionReportState`:

```typescript
export interface FusionReportState {
    conflictingFusionIdentityAccounts: Map<string, Map<string, string>>
    matchAccounts: FusionAccount[]
    failedMatchingAccounts: FusionReportAccount[]
    deferredMatchReportData: FusionReportAccount[]
    analyzedNonMatchReportData: FusionReportAccount[]
    newManagedAccountsCount: number
    urlContext: UrlContext
    sourcesByName: Map<string, SourceInfo>
    reportAttributes: string[]
    fusionIdentityComparisonsByAccount: WeakMap<FusionAccount, number>
    sources: SourceService
    fusionAutoAssignmentScore?: number
}
```

4. Replace the call in `buildMatchAccounts`:

```typescript
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                state.urlContext,
                sourceInfo?.sourceType,
                state.reportAttributes,
                undefined,
                resolveReportAccountId(fusionAccount, state.sources)
            ),
```

- [ ] **Step 7: Update the report state call site**

In `src/services/fusionService/fusionService.ts` `generateReport`, replace the `resolveReportAccountId` callback with `sources: this.sources`:

```typescript
        const report = buildFusionReport(
            {
                conflictingFusionIdentityAccounts: tracker.conflictingFusionIdentityAccounts,
                matchAccounts: tracker.matchAccounts,
                failedMatchingAccounts: tracker.failedMatchingAccounts,
                deferredMatchReportData: tracker.deferredMatchReportData,
                analyzedNonMatchReportData: tracker.analyzedNonMatchReportData,
                newManagedAccountsCount: tracker.newManagedAccountsCount,
                urlContext: this.urlContext,
                sourcesByName: this.sourcesByName,
                reportAttributes: this.reportAttributes,
                fusionIdentityComparisonsByAccount: tracker.fusionIdentityComparisonsByAccount,
                sources: this.sources,
                fusionAutoAssignmentScore: this.config.fusionAutoAssignmentScore,
            },
            includeNonMatches,
            stats
        )
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- src/services/fusionService/__tests__/fusionService.test.ts` and `npm run typecheck`
Expected: PASS / no errors.

- [ ] **Step 9: Commit**

```bash
git add src/services/fusionService/reportAccountResolver.ts \
        src/services/fusionService/__tests__/reportAccountResolver.test.ts \
        src/services/fusionService/fusionService.ts \
        src/services/fusionService/fusionReportBuilder.ts

git commit -m "refactor: extract report account resolver from FusionService"
```

---

## Task 2: Extract managed account analysis recorder

**Files:**
- Create: `src/services/fusionService/managedAccountAnalysisRecorder.ts`
- Create: `src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts`
- Modify: `src/services/fusionService/fusionService.ts:1088-1187,1203-1218`
- Modify: `src/services/fusionService/fusionService.ts:constructor` (initialize recorder)

**Interfaces:**
- Consumes:
  - `LogService`
  - `AggregationTracker`
  - `UrlContext`
  - `reportAttributes: string[]`
  - `sourcesByName: Map<string, SourceInfo>`
  - `FusionConfig`
  - `ManagedAccountAnalyzer`
  - `SourceService` (for resolver)
  - `shouldCaptureReportData: () => boolean`
  - `FusionAccount` / `ManagedAccountAnalysisContext`
- Produces:
  - `recordAnalysis(analysis)` — mutates tracker
  - `trackFailed(fusionAccount, error)` — mutates tracker

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { AggregationTracker } from '../aggregationTracker'
import { ManagedAccountAnalysisRecorder } from '../managedAccountAnalysisRecorder'
import { SourceType } from '../../../model/config'
import { MatchCandidateType } from '../../scoringService/types'

function makeRecorder(overrides: Record<string, any> = {}) {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const tracker = new AggregationTracker()
    const urlContext = {
        identity: vi.fn(() => 'identity-url'),
        humanAccount: vi.fn(() => 'human-url'),
    } as any
    const analyzer = {
        isDeferredMatchingEnabledForSource: vi.fn(() => false),
        isRecordMatchingEnabledForSource: vi.fn(() => true),
    } as any
    const sources = { resolveIscAccountIdForManagedKey: vi.fn(() => 'isc-123') } as any
    return {
        recorder: new ManagedAccountAnalysisRecorder({
            log,
            tracker,
            urlContext,
            reportAttributes: [],
            sourcesByName: new Map(),
            config: { fusionReportOnAggregation: true } as any,
            analyzer,
            sources,
            shouldCaptureReportData: () => true,
            ...overrides,
        }),
        log,
        tracker,
        urlContext,
        analyzer,
        sources,
    }
}

describe('ManagedAccountAnalysisRecorder', () => {
    it('records a match account', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = {
            isMatch: true,
            fusionMatches: [
                { candidateType: 'identity', identityId: 'id-1', identityName: 'Jane', scores: [] },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityBackedMatches: true,
            fusionIdentityComparisons: 5,
        })
        expect(tracker.matchAccounts).toContain(fusionAccount)
        expect(tracker.fusionIdentityComparisonsByAccount.get(fusionAccount)).toBe(5)
    })

    it('records a deferred match account', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = {
            name: 'acct',
            sourceName: 'HR',
            isMatch: true,
            fusionMatches: [
                { candidateType: MatchCandidateType.NewUnmatched, identityName: 'Jane', scores: [] },
            ],
        } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityBackedMatches: false,
            fusionIdentityComparisons: 3,
        })
        expect(tracker.deferredMatchReportData.length).toBe(1)
        expect(tracker.deferredMatchReportData[0].deferred).toBe(true)
    })

    it('skips non-match data for authoritative deferred sources', () => {
        const { recorder, tracker, analyzer } = makeRecorder()
        analyzer.isDeferredMatchingEnabledForSource.mockReturnValue(true)
        const fusionAccount = { name: 'acct', sourceName: 'HR', isMatch: false } as any
        recorder.recordAnalysis({
            account: { name: 'acct', sourceName: 'HR' } as any,
            fusionAccount,
            sourceInfo: undefined,
            sourceType: SourceType.Authoritative,
            hasIdentityBackedMatches: false,
            fusionIdentityComparisons: 0,
        })
        expect(tracker.analyzedNonMatchReportData.length).toBe(0)
    })

    it('records failed matching', () => {
        const { recorder, tracker } = makeRecorder()
        const fusionAccount = { name: 'acct', sourceName: 'HR' } as any
        recorder.trackFailed(fusionAccount, 'form failed')
        expect(tracker.failedMatchingAccounts.length).toBe(1)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceInfo, SourceType } from '../../model/config'
import { LogService } from '../logService'
import { SourceService } from '../sourceService'
import { UrlContext } from '../../utils/url'
import { ManagedAccountAnalyzer, ManagedAccountAnalysisContext } from './managedAccountAnalyzer'
import { AggregationTracker } from './aggregationTracker'
import {
    buildMinimalFusionReportAccount,
    formatFusionMatchDiscoveryLog,
    fusionReportMatchCandidateAccountFields,
    mapScoreReportsForFusionReport,
} from './helpers'
import { isExactAttributeMatchScores } from '../scoringService/exactMatch'
import { MatchCandidateType } from '../scoringService/types'
import { resolveReportAccountId, resolveReportAccountIdValue } from './reportAccountResolver'

export interface ManagedAccountAnalysisRecorderDeps {
    log: LogService
    tracker: AggregationTracker
    urlContext: UrlContext
    reportAttributes: string[]
    sourcesByName: Map<string, SourceInfo>
    config: FusionConfig
    analyzer: ManagedAccountAnalyzer
    sources: SourceService
    shouldCaptureReportData: () => boolean
}

export class ManagedAccountAnalysisRecorder {
    constructor(private readonly deps: ManagedAccountAnalysisRecorderDeps) {}

    recordAnalysis(analysis: ManagedAccountAnalysisContext): void {
        const { account, fusionAccount, sourceType, hasIdentityBackedMatches, fusionIdentityComparisons } = analysis
        const { name, sourceName } = account
        const { log, tracker, urlContext, reportAttributes, sourcesByName, analyzer, sources, shouldCaptureReportData } =
            this.deps

        tracker.fusionIdentityComparisonsByAccount.set(fusionAccount, fusionIdentityComparisons)
        if (fusionAccount.isMatch) {
            if (hasIdentityBackedMatches) {
                const identityMatches = fusionAccount.fusionMatches.filter(
                    (m) => (m.candidateType ?? MatchCandidateType.Identity) === MatchCandidateType.Identity
                )
                const { headline, summary } = formatFusionMatchDiscoveryLog(identityMatches, false)
                log.info(`${headline}: ${name} [${sourceName}] - ${summary}`)
            }
            if (!shouldCaptureReportData()) return
            const reportAccountId = resolveReportAccountId(fusionAccount, sources)
            if (hasIdentityBackedMatches) {
                tracker.matchAccounts.push(fusionAccount)
                return
            }
            const sourceTypeValue = sourcesByName.get(fusionAccount.sourceName)?.sourceType
            const deferredMatches = fusionAccount.fusionMatches
                .filter((match) => match.candidateType === MatchCandidateType.NewUnmatched)
                .map((match) => {
                    const fields = fusionReportMatchCandidateAccountFields(match)
                    const fi = match.fusionIdentity
                    const peerIdentityId = fi?.identityId
                    const peerManagedAccountReportId = resolveReportAccountIdValue(fi?.managedAccountId, sources)
                    const candidateAccountReportId = resolveReportAccountIdValue(fields.accountId, sources)
                    const identityUrl =
                        (peerIdentityId ? urlContext.identity(peerIdentityId) : undefined) ??
                        (peerManagedAccountReportId ? urlContext.humanAccount(peerManagedAccountReportId) : undefined) ??
                        (candidateAccountReportId ? urlContext.humanAccount(candidateAccountReportId) : undefined)
                    return {
                        ...fields,
                        identityName: match.identityName,
                        identityId: peerIdentityId,
                        identityUrl,
                        isMatch: true,
                        candidateType: MatchCandidateType.NewUnmatched,
                        exact: isExactAttributeMatchScores(match.scores),
                        scores: mapScoreReportsForFusionReport(match.scores),
                    }
                })
            tracker.deferredMatchReportData.push({
                ...buildMinimalFusionReportAccount(
                    fusionAccount,
                    urlContext,
                    sourceTypeValue,
                    reportAttributes,
                    undefined,
                    reportAccountId
                ),
                deferred: true,
                fusionIdentityComparisons,
                matches: deferredMatches,
            })
            return
        }
        log.debug(`No match found for managed account: ${name} [${sourceName}]`)
        if (
            sourceType === SourceType.Authoritative &&
            analyzer.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)
        ) {
            return
        }
        if (!shouldCaptureReportData()) return
        tracker.analyzedNonMatchReportData.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                urlContext,
                sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                reportAttributes,
                undefined,
                resolveReportAccountId(fusionAccount, sources)
            ),
            fusionIdentityComparisons,
        })
    }

    trackFailed(fusionAccount: FusionAccount, error: string): void {
        const { log, tracker, urlContext, reportAttributes, sourcesByName, sources, shouldCaptureReportData } = this.deps
        log.error(`Failed matching for account ${fusionAccount.name} [${fusionAccount.sourceName}]: ${error}`)
        if (!shouldCaptureReportData()) return
        tracker.failedMatchingAccounts.push({
            ...buildMinimalFusionReportAccount(
                fusionAccount,
                urlContext,
                sourcesByName.get(fusionAccount.sourceName)?.sourceType,
                reportAttributes,
                error,
                resolveReportAccountId(fusionAccount, sources)
            ),
            fusionIdentityComparisons: tracker.fusionIdentityComparisonsByAccount.get(fusionAccount) ?? 0,
        })
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts`
Expected: PASS.

- [ ] **Step 5: Update FusionService to use the recorder**

In `src/services/fusionService/fusionService.ts`:
1. Import `ManagedAccountAnalysisRecorder` from `./managedAccountAnalysisRecorder`.
2. Add a field near the other processor fields:

```typescript
    private analysisRecorder: ManagedAccountAnalysisRecorder
```

3. Initialize it in the constructor after `this.urlContext` is set:

```typescript
        this.urlContext = createUrlContext(config.baseurl)
        this.analysisRecorder = new ManagedAccountAnalysisRecorder({
            log: this.log,
            tracker: this.tracker,
            urlContext: this.urlContext,
            reportAttributes: this.reportAttributes,
            sourcesByName: this.sourcesByName,
            config: this.config,
            analyzer: this.managedAccountAnalyzer,
            sources: this.sources,
            shouldCaptureReportData: () => this.shouldCaptureManagedAccountReportData(),
        })
        this.commandType = commandType
```

Note: `this.tracker` is a getter (see `private get tracker()`). Make sure the recorder is initialized after the getter is safe to use.

4. In `completeManagedAccountFromAnalysis`, replace `this.recordManagedAccountAnalysis(analysis)` with `this.analysisRecorder.recordAnalysis(analysis)`. Immediately after the recorder call, add the deferred-matching side effects that were previously inside `recordManagedAccountAnalysis`:

```typescript
    private async completeManagedAccountFromAnalysis(
        analysis: ManagedAccountAnalysisContext,
        deferredPhaseExecuted: boolean
    ): Promise<FusionAccount | undefined> {
        const { account, fusionAccount, sourceInfo, sourceType, hasIdentityBackedMatches } = analysis
        this.analysisRecorder.recordAnalysis(analysis)

        if (
            !fusionAccount.isMatch &&
            sourceType === SourceType.Authoritative &&
            this.isDeferredMatchingEnabledForSource(fusionAccount.sourceName)
        ) {
            this.setFusionAccount(fusionAccount)
            this.registerCurrentRunUnmatchedCandidate(fusionAccount)
        }

        if (hasIdentityBackedMatches) {
            return this.handleIdentityBackedMatch(fusionAccount, account, sourceInfo)
        }

        if (!deferredPhaseExecuted) {
            return undefined
        }
        if (checkHasNewUnmatchedPeerMatches(fusionAccount)) {
            return this.handleDeferredMatch(fusionAccount, account)
        }
        return this.handleNonMatch(fusionAccount, account, sourceType, sourceInfo)
    }
```

5. Replace the two call sites of `this.trackFailedMatching(fusionAccount, ...)` with `this.analysisRecorder.trackFailed(fusionAccount, ...)`.

6. Delete the private `recordManagedAccountAnalysis` and `trackFailedMatching` methods.

- [ ] **Step 6: Run full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: All tests pass; no type errors.

- [ ] **Step 7: Run lint on changed files**

Run:
```bash
npx eslint src/services/fusionService/reportAccountResolver.ts \
          src/services/fusionService/managedAccountAnalysisRecorder.ts \
          src/services/fusionService/fusionService.ts \
          src/services/fusionService/fusionReportBuilder.ts \
          src/services/fusionService/__tests__/reportAccountResolver.test.ts \
          src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/fusionService/managedAccountAnalysisRecorder.ts \
        src/services/fusionService/__tests__/managedAccountAnalysisRecorder.test.ts \
        src/services/fusionService/fusionService.ts

git commit -m "refactor: extract managed account analysis recorder from FusionService"
```

---

## Task 3: Final verification and cleanup

- [ ] **Step 1: Review inline comments and JSDoc**

Check that comments on the removed private methods are deleted and that new modules have concise, accurate JSDoc where helpful.

- [ ] **Step 2: Run full project verification**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: All pass.

- [ ] **Step 3: Update AGENTS.md if needed**

If any project conventions, build steps, or test commands changed, update the relevant `AGENTS.md` section. For this refactor, likely no update is needed; confirm before skipping.

---

## Self-Review

1. **Spec coverage:** The fusionService spec covers FusionAccount construction and blending; this refactor does not change those contracts, only internal delegation. No gaps.
2. **Placeholder scan:** All steps contain concrete code and commands. No TBD/placeholder text.
3. **Type consistency:** The `ManagedAccountAnalysisContext` type is imported from `./managedAccountAnalyzer` and matches the existing definition. `resolveReportAccountId` signatures stay identical to the current private methods.
4. **Behavior preservation:** The deferred-matching side effects (`setFusionAccount`, `registerCurrentRunUnmatchedCandidate`) remain in `FusionService` and are executed in the same logical order. Failed matching records include the per-account comparison count.

## Execution Handoff

**Plan complete and saved to `openspec/changes/fusion-service-analysis-recorder-extraction/plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Run `/opsx-apply` to start implementing.
