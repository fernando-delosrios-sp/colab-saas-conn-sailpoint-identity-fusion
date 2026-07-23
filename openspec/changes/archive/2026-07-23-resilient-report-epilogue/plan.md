# Resilient Report Epilogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report emission an always-runs, failure-isolated epilogue (never a phase), and eliminate dry-run write side effects (correlation PATCHes, delayed-aggregation fetch).

**Architecture:** `accountList` becomes pipeline (phases 1–5, errors captured) → `reportPhase()` epilogue (guarded steps, durable-first ordering, never throws) → deferred rethrow. Dry-run suppression of correlation-on-aggregation via a runtime persistence flag on `FusionService`, consumed by `CorrelationManager`.

**Tech Stack:** TypeScript (strict, CommonJS), Vitest (globals: true), SailPoint connector-sdk.

## Global Constraints

- Prettier: 120 col, 4-space indent, single quotes, NO semicolons, trailing commas.
- Tests: Vitest with globals (`describe`/`it`/`expect`/`vi` — no imports needed). NEVER pipe `npm test` to `tail`; run specific test files: `npx vitest run <path>`.
- Git commits require explicit user authorization per repo policy — if not authorized, skip all commit steps and leave changes staged.
- Canonical terms per `openspec/specs/ubiquitous-language/spec.md`; the new term is **Epilogue**.
- Interfaces this plan produces (referenced across tasks):
  - `FusionService.setPersistentRun(isPersistent: boolean): void`
  - `CorrelationManager` constructor gains 6th param `isPersistentRun: () => boolean`
  - `PhaseOptions` gains `streamProgress?: { sent: number }`
  - `reportPhase(serviceRegistry: ServiceRegistry, options: ReportPhaseOptions): Promise<unknown | undefined>` in `src/operations/helpers/accountListPhases.ts`

---

### Task 1: Dry-run write-side-effect elimination

**Files:**
- Modify: `src/services/correlationManager.ts` (constructor L9-15, `applyPerSourceCorrelationIfNeeded` L84-91)
- Modify: `src/services/fusionService/fusionService.ts` (field near L111, CorrelationManager construction L127-133, setter near `setTracker`)
- Modify: `src/operations/helpers/accountListPhases.ts` (`setupPhase` ~L95, `fetchPhase` L182-184)
- Test: `src/services/__tests__/correlationManager.test.ts` (new)
- Test: `src/operations/__tests__/accountList.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `setPersistentRun` (Task 2's `setupPhase` calls it); guarded `fetchPhase`.

- [ ] **Step 1: Write the failing CorrelationManager tests**

Create `src/services/__tests__/correlationManager.test.ts`:

```ts
import { CorrelationManager } from '../correlationManager'

function createManager(isPersistentRun: boolean) {
    const identities = { correlateAccounts: vi.fn().mockResolvedValue(undefined) } as any
    const sources = { getSourceConfig: vi.fn().mockReturnValue({ correlationMode: 'correlate' }) } as any
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as any
    const manager = new CorrelationManager({} as any, log, sources, identities, () => true, () => isPersistentRun)
    return { manager, identities }
}

function createFusionAccount() {
    return {
        missingAccountIdsSet: new Set(['acct-1']),
        missingAccountIds: ['acct-1'],
        identityId: 'id-1',
        name: 'Test User',
        getManagedAccountInfo: vi.fn().mockReturnValue({ source: { name: 'HR' } }),
    } as any
}

describe('CorrelationManager dry-run suppression', () => {
    it('suppresses correlation-on-aggregation when the run is non-persistent', async () => {
        const { manager, identities } = createManager(false)
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })

    it('applies correlation-on-aggregation when the run is persistent', async () => {
        const { manager, identities } = createManager(true)
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'])
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/services/__tests__/correlationManager.test.ts`
Expected: FAIL — constructor takes 5 args; TS error or `isPersistentRun` undefined behavior.

- [ ] **Step 3: Implement the guard**

`src/services/correlationManager.ts` — constructor gains the closure; guard the aggregation-time entry point only (NOT `correlateMissingAccountsPerSource`, which serves the explicit correlate action):

```ts
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private sources: SourceService,
        private identities: IdentityService,
        private isAggregationMode: () => boolean,
        private isPersistentRun: () => boolean
    ) {}
```

```ts
    public async applyPerSourceCorrelationIfNeeded(
        fusionAccount: FusionAccount,
        authorizedLinkDecision?: FusionDecision
    ): Promise<void> {
        if (!this.isAggregationMode()) return
        if (!this.isPersistentRun()) return
        if (fusionAccount.missingAccountIdsSet.size === 0) return
        await this.correlatePerSource(fusionAccount, authorizedLinkDecision)
    }
```

`src/services/fusionService/fusionService.ts` — add field + setter (next to `setTracker`), and pass the closure at L127-133:

```ts
    private _isPersistentRun = true

    public setPersistentRun(isPersistent: boolean): void {
        this._isPersistentRun = isPersistent
    }
```

```ts
        this.correlationManager = new CorrelationManager(
            config,
            log,
            this.sources,
            this.identities,
            () => this.accountAssembly.isAggregationAccountListMode(),
            () => this._isPersistentRun
        )
```

(Default `true` preserves behavior for all non-accountList constructors: actions, tests, reportAction.)

`src/operations/helpers/accountListPhases.ts` — in `setupPhase`, right after `if (tracker) fusion.setTracker(tracker)`:

```ts
    fusion.setPersistentRun(isPersistent)
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/services/__tests__/correlationManager.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing delayed-aggregation dry-run test**

Append to the dry-run describe block in `src/operations/__tests__/accountList.test.ts`:

```ts
    it('does not fetch the delayed-aggregation sender workflow in dry-run', async () => {
        const { registry, sources } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        Object.defineProperty(sources, 'delayedAggregationSources', {
            value: [{ id: 'source-1', name: 'AD', delayMinutes: 5 }],
            configurable: true,
        })
        const input = { dryRun: { enabled: true }, schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(registry.workflows.fetchDelayedAggregationSender).not.toHaveBeenCalled()
    })
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts -t "delayed-aggregation sender"`
Expected: FAIL — `fetchDelayedAggregationSender` called once (unguarded in `fetchPhase`).

- [ ] **Step 7: Guard the fetch and update harnesses for `setPersistentRun`**

`src/operations/helpers/accountListPhases.ts` L182-184:

```ts
    if (isPersistent && sources.delayedAggregationSources?.length) {
        fetchTasks.push(workflows.fetchDelayedAggregationSender())
    }
```

Harness mocks (required because `setupPhase` now calls `fusion.setPersistentRun`):
- `src/operations/__tests__/harness/operationTestRegistry.ts` after `fusion.setTracker = vi.fn()` (L72): add `fusion.setPersistentRun = vi.fn()`
- `src/operations/__tests__/chain/harness/ReplayAdapter.ts`: add the same mock wherever `fusion` methods are stubbed (~L497).

- [ ] **Step 8: Run both suites to verify pass**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts src/services/__tests__/correlationManager.test.ts`
Expected: PASS (all).

- [ ] **Step 9: Commit (only if authorized)**

```bash
git add src/services/correlationManager.ts src/services/fusionService/fusionService.ts src/operations/helpers/accountListPhases.ts src/services/__tests__/correlationManager.test.ts src/operations/__tests__/
git commit -m "feat: suppress correlation writes and delayed-aggregation fetch in dry-run"
```

---

### Task 2: Report epilogue — `reportPhase()`, stream progress, deferred rethrow

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts` (`PhaseOptions` L7-10, `outputPhase` send callback L288-291, new `reportPhase` + `ReportPhaseOptions`)
- Modify: `src/operations/accountList.ts` (full restructure)
- Test: `src/operations/__tests__/accountList.test.ts`

**Interfaces:**
- Consumes: `setPersistentRun` (Task 1, already called in `setupPhase`).
- Produces: `reportPhase(registry, ReportPhaseOptions) => Promise<unknown | undefined>`; `ReportPhaseOptions = { isPersistent: boolean; dryRun?: DryRunInput; fetchResult?: FetchResult; outputCount?: number; timer: ReturnType<ServiceRegistry['log']['timer']>; runError?: unknown }`.

- [ ] **Step 1: Write the failing epilogue tests**

Append a new describe block to `src/operations/__tests__/accountList.test.ts`:

```ts
describe('accountList report epilogue', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('emits the aggregation report and rethrows when res.send fails mid-stream', async () => {
        const { registry, sources, fusion } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        fusion.fusionReportOnAggregation = true
        fusion.forEachISCAccount.mockImplementation(async (sendFn: (a: unknown) => void) => {
            sendFn({ id: 'a1' })
            return { sent: 1, eligible: 1 }
        })
        ;(registry.res.send as Mock).mockImplementation(() => {
            throw new Error('write after end')
        })

        await expect(accountList(registry, { schema: { attributes: [] } } as any)).rejects.toThrow('write after end')

        expect(registry.reports.generateAndSendFusionReport).toHaveBeenCalledTimes(1)
        expect(registry.definition.saveState).not.toHaveBeenCalled()
        expect(sources.saveBatchCumulativeCount).not.toHaveBeenCalled()
        expect(sources.releaseProcessLock).toHaveBeenCalledTimes(1)
    })

    it('saves dry-run report artifacts before a failing summary send', async () => {
        const { registry } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        const reports = registry.reports as any
        reports.initializeDryRunReport = vi.fn().mockReturnValue({ report: {}, stats: {} })
        reports.finalizeDryRunReport = vi.fn().mockResolvedValue({ reportHtmlOutputPath: './reports/dry-run.html' })
        ;(registry.res.send as Mock).mockImplementation(() => {
            throw new Error('write after end')
        })
        const input = { dryRun: { enabled: true, saveFile: true }, schema: { attributes: [] } } as any

        await expect(accountList(registry, input)).rejects.toThrow('write after end')

        expect(reports.finalizeDryRunReport).toHaveBeenCalledTimes(1)
        expect(reports.finalizeDryRunReport.mock.invocationCallOrder[0]).toBeLessThan(
            (registry.res.send as Mock).mock.invocationCallOrder[0]
        )
    })

    it('sends the summary even when dry-run report artifacts fail', async () => {
        const { registry } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        const reports = registry.reports as any
        reports.initializeDryRunReport = vi.fn().mockReturnValue({ report: {}, stats: {} })
        reports.finalizeDryRunReport = vi.fn().mockRejectedValue(new Error('email down'))
        const input = { dryRun: { enabled: true, saveFile: true }, schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(registry.res.send).toHaveBeenCalledWith(expect.objectContaining({ rowsSent: expect.any(Number) }))
    })

    it('emits report artifacts before the summary on a clean dry-run', async () => {
        const { registry } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        const reports = registry.reports as any
        reports.initializeDryRunReport = vi.fn().mockReturnValue({ report: {}, stats: {} })
        reports.finalizeDryRunReport = vi.fn().mockResolvedValue({ reportHtmlOutputPath: './reports/dry-run.html' })
        const input = { dryRun: { enabled: true, saveFile: true }, schema: { attributes: [] } } as any

        await accountList(registry, input)

        expect(reports.finalizeDryRunReport.mock.invocationCallOrder[0]).toBeLessThan(
            (registry.res.send as Mock).mock.invocationCallOrder[0]
        )
        expect(registry.res.send).toHaveBeenCalledWith(expect.objectContaining({ rowsSent: expect.any(Number) }))
    })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts -t "report epilogue"`
Expected: FAIL — test 1: report not called after crash; test 2/4: ordering reversed (send before finalize).

- [ ] **Step 3: Add `streamProgress` and the `reportPhase` helper**

`src/operations/helpers/accountListPhases.ts` — extend `PhaseOptions`:

```ts
export interface PhaseOptions {
    isPersistent: boolean
    tracker?: AggregationTracker
    streamProgress?: { sent: number }
}
```

In `outputPhase`, replace the send callback (L288-291):

```ts
    const { sent, eligible } = await fusion.forEachISCAccount((account) => {
        res.send(account)
        if (options.streamProgress) options.streamProgress.sent++
    }, isPersistent)
```

Add imports at top: `import { generateReport } from './generateReport'` and `import { buildTerminalSummary, DryRunInput } from './accountListHelpers'`. Append the epilogue helper:

```ts
export interface ReportPhaseOptions {
    isPersistent: boolean
    dryRun?: DryRunInput
    fetchResult?: FetchResult
    outputCount?: number
    timer: ReturnType<ServiceRegistry['log']['timer']>
    runError?: unknown
}

/**
 * Report epilogue — always-runs terminal block that emits reports and summaries
 * after the pipeline, regardless of pipeline success. Never throws: report
 * channels are best-effort, except the dry-run terminal summary whose failure
 * is returned as a deferred error (it is the dry-run's platform output).
 *
 * Ordering is most-durable-first: report file → report email → summary send.
 */
export async function reportPhase(
    serviceRegistry: ServiceRegistry,
    options: ReportPhaseOptions
): Promise<unknown | undefined> {
    const { log, reports, res, fusion } = serviceRegistry
    const { isPersistent, dryRun, fetchResult, outputCount, timer } = options
    let deferredError: unknown

    if (isPersistent && fetchResult && fusion.fusionReportOnAggregation) {
        try {
            log.info('Generating aggregation report')
            const reportOp = log.track('reportPhase.generateReport')
            await generateReport(false, serviceRegistry, fetchResultToAggregationStats(fetchResult, timer))
            reportOp.done()
        } catch (error) {
            log.warn(`Report epilogue: aggregation report failed: ${(error as Error).message}`)
        }
    }

    if (dryRun && fetchResult) {
        if (dryRun.saveFile || dryRun.sendEmail) {
            try {
                const { report } = reports.initializeDryRunReport({
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseTiming: timer.getPhaseBreakdown(),
                })
                const { reportHtmlOutputPath } = await reports.finalizeDryRunReport({
                    report,
                    fetchResult,
                    totalProcessingTime: timer.totalElapsed(),
                    phaseBreakdownThroughOutput: timer.getPhaseBreakdown(),
                    saveFile: dryRun.saveFile,
                    sendEmail: dryRun.sendEmail,
                })
                if (reportHtmlOutputPath) {
                    log.info(`Dry-run HTML report written to ${reportHtmlOutputPath}`)
                }
            } catch (error) {
                log.warn(`Report epilogue: dry-run report failed: ${(error as Error).message}`)
            }
        }

        try {
            const summary = buildTerminalSummary(serviceRegistry, { outputCount, fetchResult, timer }, dryRun)
            res.send(summary)
        } catch (error) {
            log.warn(`Report epilogue: terminal summary send failed: ${(error as Error).message}`)
            deferredError = error
        }
    }

    timer.phase('Epilogue: report generation', 'info', 'Report')
    return deferredError
}
```

- [ ] **Step 4: Restructure `accountList`**

Replace `src/operations/accountList.ts` in full:

```ts
import { ConnectorError, StdAccountListInput } from '@sailpoint/connector-sdk'
import { ServiceRegistry } from '../services/serviceRegistry'
import { AggregationTracker } from '../services/fusionService'
import { FetchResult } from './helpers/accountListPhases'
import { parseDryRunInput } from './helpers/accountListHelpers'
import {
    PhaseOptions,
    setupPhase,
    fetchPhase,
    refreshPhase,
    processPhase,
    outputPhase,
    reportPhase,
} from './helpers/accountListPhases'

export { hydrateCorrelatedManagedAccountIdentities } from './helpers/accountListPhases'

/**
 * Account list operation — main entry point for identity fusion processing.
 *
 * Supports an optional dry-run mode via the dryRun input parameter:
 *   { dryRun: { enabled: true, saveFile?: boolean, sendEmail?: string | string[] } }
 *
 * When dry-run mode is active, the operation runs non-persistently (no state,
 * forms, correlation, or scheduling side effects), emits optional report
 * artifacts (file and/or email), and sends a terminal summary object last.
 *
 * The pipeline (phases 1-5) is fallible; the report epilogue always runs so
 * that durable artifacts survive pipeline failures. Pipeline errors are
 * rethrown after the epilogue so failed runs are still marked failed.
 */
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log, sources } = serviceRegistry
    const tracker = new AggregationTracker()
    const dryRun = parseDryRunInput(input)
    const isPersistent = !dryRun
    const timer = log.timer()
    const streamProgress = { sent: 0 }
    let fetchResult: FetchResult | undefined
    let outputCount: number | undefined
    let runError: unknown

    try {
        try {
            log.info(dryRun ? 'Starting dry-run analysis' : 'Starting aggregation')

            const options: PhaseOptions = { isPersistent, tracker, streamProgress }

            if (!(await setupPhase(serviceRegistry, input.schema, options))) return
            timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

            fetchResult = await fetchPhase(serviceRegistry, options)
            timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

            await refreshPhase(serviceRegistry)
            timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

            await processPhase(serviceRegistry, options)
            timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

            outputCount = await outputPhase(serviceRegistry, options)
            timer.phase('PHASE 5: Output (JIT attributes, serialize & clean up memory)', 'info', 'Output')
        } catch (error) {
            runError = error
            log.warn(`Pipeline failed — running report epilogue before propagating: ${(error as Error).message}`)
        }

        const epilogueError = await reportPhase(serviceRegistry, {
            isPersistent,
            dryRun,
            fetchResult,
            outputCount,
            timer,
            runError,
        })
        runError = runError ?? epilogueError

        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.info('Fusion accounts cache retained for recording')
        }
        log.info('Account caches cleared from memory')

        if (runError) {
            if (runError instanceof ConnectorError) throw runError
            if (isPersistent) {
                log.crash('Failed to list accounts', runError as any)
            }
            throw runError
        }

        const label = dryRun ? 'Dry-run analysis' : 'Account list operation'
        timer.end(`✓ ${label} completed successfully - ${outputCount ?? 0} account(s) processed`)
    } finally {
        if (isPersistent) {
            await sources.releaseProcessLock()
        }
    }
}
```

- [ ] **Step 5: Run epilogue tests to verify pass**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts`
Expected: PASS (entire file, including pre-existing tests).

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add src/operations/accountList.ts src/operations/helpers/accountListPhases.ts src/operations/__tests__/accountList.test.ts
git commit -m "feat: report epilogue with failure isolation and durable-first dry-run ordering"
```

---

### Task 3: Labels, ubiquitous language, doc comment

**Files:**
- Modify: `src/services/reportService.ts` (L432, L477)
- Modify: `openspec/specs/ubiquitous-language/spec.md` ("Operations, phases, and sweeps" table ~L176-184)
- Test: `src/operations/__tests__/accountList.test.ts` (label assertion)

**Interfaces:**
- Consumes: `reportPhase` (Task 2). Produces: nothing.

- [ ] **Step 1: Write the failing label test**

Append to the epilogue describe block in `src/operations/__tests__/accountList.test.ts`:

```ts
    it('logs Epilogue labels and no numbered report phases', async () => {
        const { registry } = createMockRegistry([{ name: 'fusion', correlationMode: 'none' }])
        const log = registry.log as any
        const phaseSpy = vi.spyOn(log, 'phase').mockReturnValue(undefined)

        await accountList(registry, { schema: { attributes: [] } } as any)

        const labels = phaseSpy.mock.calls.map((call) => String(call[0]))
        expect(labels.some((l) => l.startsWith('Epilogue: report generation'))).toBe(true)
        expect(labels.some((l) => /PHASE [67]/.test(l))).toBe(false)
    })
```

(If `log.phase` cannot be spied because the timer closure captures it, assert via `log.info` calls instead — adjust to the harness's real timer implementation.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts -t "Epilogue labels"`
Expected: FAIL — `PHASE 6: Report generation` still logged.

- [ ] **Step 3: Rename reportService labels**

`src/services/reportService.ts` L477: replace `'PHASE 7: Report (fusion report)'` with `'Epilogue: fusion report'`.
L432: replace `` `PHASE 7: Report — HTML/email and stats (${PhaseTimer.formatElapsed(reportElapsedMs)})` `` with `` `Epilogue: report — HTML/email and stats (${PhaseTimer.formatElapsed(reportElapsedMs)})` ``.

- [ ] **Step 4: Update the ubiquitous-language glossary**

In `openspec/specs/ubiquitous-language/spec.md`, "Operations, phases, and sweeps" table: change the **Phase** row to remove the report example, and add an **Epilogue** row:

```markdown
| **Phase** | A major stage of an operation pipeline (for example the identity documents phase, the Fusion accounts phase, or the managed accounts phase). The report step is not a phase; see **Epilogue**. |
| **Epilogue** | The always-runs terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of pipeline success. Ordered most-durable-first (report file, report email, summary send). |
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/operations/__tests__/accountList.test.ts src/services/__tests__/reportService.test.ts`
Expected: PASS (update any pre-existing label assertions in reportService tests that match the old strings).

- [ ] **Step 6: Commit (only if authorized)**

```bash
git add src/services/reportService.ts openspec/specs/ubiquitous-language/spec.md src/operations/__tests__/
git commit -m "refactor: rename report step to Epilogue in logs and glossary"
```

---

### Task 4: Documentation and full verification

**Files:**
- Modify: any docs referencing PHASE 6/7 or dry-run output behavior (search first: `grep -rn "PHASE [67]" docs/ README.md` and `grep -rln "1-to-1" docs/ README.md`)

- [ ] **Step 1: Update user-facing docs to Epilogue terminology and file → email → summary ordering; note dry-run emits a terminal summary (no row streaming in current behavior)**
- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites, including chain/ReplayAdapter tests).

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit (only if authorized)**

```bash
git add docs/ README.md
git commit -m "docs: epilogue terminology for report step"
```

---

## Self-Review Notes

- Spec coverage: all 4 added `account-list-operation` requirements map to Tasks 1–2 tests; the `ubiquitous-language` requirement maps to Task 3. The "Dry-run mode streams 1-to-1 StdAccountListOutput rows" requirement is intentionally untouched (pre-existing code↔spec gap; see design D6/Open Questions).
- Type consistency: `setPersistentRun`, `isPersistentRun` closure, `streamProgress`, `reportPhase`/`ReportPhaseOptions` names are used identically across tasks.
- Known harness risk: if the label test's `log.phase` spy doesn't intercept the real `PhaseTimer`, fall back to asserting `log.info` message content.
