# Consolidate dryRun into accountList — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `custom:dryrun` operation into `std:account:list` via an optional `dryRun` input parameter, deepen the operation-run module, delete ~1,400 lines of dry-run-specific helpers, and unify output to 1-to-1 `StdAccountListOutput` rows.

**Architecture:** `accountList.ts` gains an optional `dryRun` input parser that constructs a run descriptor (`{ persistence, outputPolicy, dryRunOptions? }`). A deepened `executeRun` function in `corePipeline.ts` parameterized by the descriptor replaces `PipelineRunner.run` + `targetPhase` ladder + exported phase functions. Phases become private. The `PipelineMode` union and `OperationContext` enum collapse into the descriptor. `dryRun.ts`, `dryRunHelpers.ts`, and `buildDryRunPayload.ts` are deleted; their analysis value (row enrichment) moves to the HTML report and terminal summary.

**Tech Stack:** TypeScript (strict), Node.js, @sailpoint/connector-sdk, Vitest (globals: true), ESLint + knip

---

## Task 1: Spec updates (pre-code)

**Files:**
- Modify: `openspec/specs/account-list-operation/spec.md`
- Delete: `openspec/specs/custom-dryrun-operation/spec.md`
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Modify: `openspec/specs/report-service/spec.md`
- Modify: `docs/concepts/glossary.md`

**Interfaces:**
- Produces: updated specs reflecting dry-run mode, retired `custom:dryrun` term, report alignment

- [ ] **Step 1:** Read delta specs from `openspec/changes/consolidate-dryrun-accountlist/specs/` — these contain the exact ADDED/MODIFIED/REMOVED requirements to apply.

- [ ] **Step 2:** Apply account-list-operation delta — add the five new requirements (dryRun input, 1-to-1 output, terminal summary, report alignment) and modify "Account list streams all accounts" to include dry-run scenario.

- [ ] **Step 3:** Delete `openspec/specs/custom-dryrun-operation/spec.md` — capability absorbed.

- [ ] **Step 4:** Apply ubiquitous-language delta — MODIFY "Operation, phase, and sweep vocabulary" scenario to remove `custom:dryrun` reference; MODIFY "Retired terms are not reintroduced" to add `custom:dryrun` to retired list; ADD "Dry-run mode is referenced as a mode, not an operation."

- [ ] **Step 5:** Apply report-service delta — MODIFY "Unified report building, rendering, and directory management" to specify `includeNonMatches: false` for dry-run reports.

- [ ] **Step 6:** Sync `docs/concepts/glossary.md` — replace "custom:dryrun (the dryRun operation)" with "dry-run mode of the accountList operation" in the Operation row.

- [ ] **Step 7:** Commit

```bash
git add openspec/specs/account-list-operation/ openspec/specs/custom-dryrun-operation/ openspec/specs/ubiquitous-language/ openspec/specs/report-service/ docs/concepts/glossary.md
git commit -m "spec: consolidate dry-run into account-list, retire custom:dryrun term"
```

---

## Task 2: Deepen the operation-run module — run descriptor

**Files:**
- Modify: `src/operations/helpers/corePipeline.ts`

**Interfaces:**
- Produces: `RunDescriptor` type, `executeRun(serviceRegistry, descriptor)` function
- Consumes: existing phase functions (to be made private)

- [ ] **Step 1:** Define the `RunDescriptor` type at the top of `corePipeline.ts`, replacing `PipelineMode`:

```typescript
interface RunDescriptor {
    /** Whether this run persists state (form updates, counters, aggregation scheduling). */
    persistence: boolean
    /** Output policy gating keepAlive behavior. */
    outputPolicy: {
        keepAlive: 'memory' | 'simple'
        keepAliveIntervalMs?: number
    }
    /** When present, the run is a dry-run analysis and these options apply. */
    dryRunOptions?: {
        saveFile: boolean
        sendEmail?: string | string[]
    }
    /** Optional phase to stop at (default: full pipeline). Used by reportAction's mini-pipeline. */
    stopAfter?: 'process'
}
```

- [ ] **Step 2:** Delete the `PipelineMode` type alias (line ~8-10) and replace all `mode.kind === 'aggregation'` / `isPersistent` checks with `descriptor.persistence`.

- [ ] **Step 3:** Write the `executeRun` function as the replacement for `PipelineRunner.run`:

```typescript
export async function executeRun(
    serviceRegistry: ServiceRegistry,
    descriptor: RunDescriptor,
    schema?: any,
    tracker?: AggregationTracker
): Promise<PipelineRunResult> {
    const { log, sources } = serviceRegistry
    const timer = log.timer()
    let shouldContinue: boolean
    let fetchResult: FetchResult | undefined
    let outputCount: number

    const pipelineOptions: CorePipelineOptions = { mode: descriptor, tracker }

    try {
        shouldContinue = await setupPhase(serviceRegistry, schema, pipelineOptions)
        if (!shouldContinue) return { shouldContinue: false, timer }
        timer.phase('PHASE 1: Setup and initialization', 'info', 'Setup')

        fetchResult = await fetchPhase(serviceRegistry, pipelineOptions)
        timer.phase('PHASE 2: Fetching data in parallel', 'info', 'Fetch')

        await refreshPhase(serviceRegistry, pipelineOptions)
        timer.phase('PHASE 3: Refresh (fusion accounts)', 'info', 'Refresh')

        await processPhase(serviceRegistry, pipelineOptions)
        timer.phase('PHASE 4: Process (identities, managed accounts, form reconciliation)', 'info', 'Process')

        if (descriptor.stopAfter === 'process') {
            return { shouldContinue: true, fetchResult, timer }
        }

        outputCount = await outputPhase(serviceRegistry, pipelineOptions)
        timer.phase('PHASE 5: Output (JIT attributes, serialize & clean up memory)', 'info', 'Output')

        if (fetchResult) {
            await reportPhase(serviceRegistry, fetchResult, timer, pipelineOptions)
        }
        timer.phase('PHASE 6: Report generation', 'info', 'Report')

        if (!sources.run.isRecordMode) {
            sources.clearFusionAccounts()
        } else {
            log.info('Fusion accounts cache retained for recording')
        }
        log.info('Account caches cleared from memory')

        return { shouldContinue: true, fetchResult, outputCount, timer }
    } catch (error) {
        if (descriptor.persistence) {
            if (!(error instanceof ConnectorError)) {
                log.crash('Failed to list accounts', error as any)
            }
        }
        throw error
    } finally {
        if (descriptor.persistence) {
            await sources.releaseProcessLock()
        }
    }
}
```

- [ ] **Step 4:** Update `CorePipelineOptions` to use `RunDescriptor` instead of `PipelineMode`:

```typescript
export interface CorePipelineOptions {
    mode: RunDescriptor
    tracker?: AggregationTracker
}
```

- [ ] **Step 5:** Update `setupPhase` — replace `const isPersistent = options.mode.kind === 'aggregation'` with `const isPersistent = options.mode.persistence`.

- [ ] **Step 6:** Update `fetchPhase` — same replacement, plus update the `ownerIncluded` line from `fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer` to use `options.mode.persistence`:

```typescript
const isPersistent = options.mode.persistence
const ownerIncluded = isPersistent
    ? (fusion.fusionReportOnAggregation || fusion.fusionOwnerIsGlobalReviewer)
    : false
```

- [ ] **Step 7:** Update `processPhase` — same `isPersistent` replacement.

- [ ] **Step 8:** Update `outputPhase` — same replacement; the entire function's `if (!isPersistent)` early-return path stays gated on `!options.mode.persistence`.

- [ ] **Step 9:** Delete the `PipelineRunner` class entirely (`static async run(...)`).

- [ ] **Step 10:** Delete the `PipelinePhase` type and `PipelineRunOptions`/`PipelineRunResult` interfaces (replace with function parameters/return type inline).

- [ ] **Step 11:** Make phase functions NOT individually exported — keep `setupPhase`, `fetchPhase`, `refreshPhase`, `processPhase`, `outputPhase` as file-private (remove `export` keyword). Keep `executeRun`, `hydrateCorrelatedManagedAccountIdentities`, and `FetchResult` as the only exports.

- [ ] **Step 12:** Delete the `PipelineMode` type entirely.

- [ ] **Step 13:** Commit

```bash
git add src/operations/helpers/corePipeline.ts
git commit -m "refactor: deepen operation-run module — RunDescriptor replaces PipelineMode, phases private"
```

---

## Task 3: Update callers of PipelineRunner → executeRun

**Files:**
- Modify: `src/operations/accountList.ts`
- Modify: `src/operations/dryRun.ts` (temporary — deleted in Task 5)
- Modify: `src/operations/helpers/generateReport.ts`

**Interfaces:**
- Consumes: `executeRun(serviceRegistry, descriptor, schema?, tracker?)` from Task 2
- Produces: accountList calls executeRun directly; generateReport's fetchAndProcessForReport uses stopAfter

- [ ] **Step 1:** Update `accountList.ts` to use `executeRun`:

```typescript
import { executeRun } from './helpers/corePipeline'

export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log } = serviceRegistry
    const tracker = new AggregationTracker()

    try {
        log.info('Starting aggregation')
        const result = await executeRun(serviceRegistry, {
            persistence: true,
            outputPolicy: { keepAlive: 'memory' },
        }, input.schema, tracker)

        if (!result.shouldContinue) return
        result.timer.end(
            `✓ Account list operation completed successfully - ${result.outputCount ?? 0} account(s) processed`
        )
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        throw error
    }
}
```

- [ ] **Step 2:** Update `generateReport.ts` `fetchAndProcessForReport` to use `executeRun`:

```typescript
import { executeRun } from './corePipeline'

export async function fetchAndProcessForReport(serviceRegistry: ServiceRegistry): Promise<AggregationStats> {
    const result = await executeRun(serviceRegistry, {
        persistence: false,
        outputPolicy: { keepAlive: 'memory' },
        stopAfter: 'process',
    })

    if (!result.shouldContinue || !result.fetchResult) {
        return { identitiesFound: 0, managedAccountsFound: 0, totalProcessingTime: result.timer.totalElapsed() }
    }

    const { fetchResult, timer } = result
    return {
        identitiesFound: fetchResult.identitiesFound,
        // ... rest unchanged
    }
}
```

- [ ] **Step 3:** Temporarily update `dryRun.ts` to use `executeRun` (will be deleted in Task 5):

```typescript
import { executeRun } from './helpers/corePipeline'

// In dryRun function:
const result = await executeRun(serviceRegistry, {
    persistence: false,
    outputPolicy: { keepAlive: 'simple', keepAliveIntervalMs: 15_000 },
    dryRunOptions: {
        saveFile: runtimeOptions.writeToDisk,
        sendEmail: runtimeOptions.sendReportTo,
    },
    stopAfter: 'process',
}, input.schema, tracker)
```

- [ ] **Step 4:** Run tests to confirm compilation:

```bash
npm test -- --run 2>&1 | head -60
```

Expected: tests may have failures (phase imports removed in Task 2) but compilation should succeed.

- [ ] **Step 5:** Commit

```bash
git add src/operations/accountList.ts src/operations/helpers/generateReport.ts src/operations/dryRun.ts
git commit -m "refactor: switch callers from PipelineRunner.run to executeRun"
```

---

## Task 4: Add dryRun input to accountList

**Files:**
- Modify: `src/operations/accountList.ts`

**Interfaces:**
- Consumes: `executeRun` from Task 2
- Produces: accountList with dry-run mode support

- [ ] **Step 1:** Read and parse the `dryRun` input object in `accountList.ts`:

```typescript
import { readBoolean, readArray } from '../utils/safeRead'
import { sanitizeRecipients } from '../services/emailService/email'

interface DryRunInput {
    enabled: boolean
    saveFile?: boolean
    sendEmail?: string | string[]
}

function parseDryRunInput(input: StdAccountListInput): DryRunInput | undefined {
    const dryRun = (input as any)?.dryRun
    if (!dryRun || typeof dryRun !== 'object') return undefined
    const enabled = readBoolean(dryRun, 'enabled', false)
    if (!enabled) return undefined
    const saveFile = readBoolean(dryRun, 'saveFile', false)
    const rawEmail = readArray(dryRun, 'sendEmail', []) as (string | undefined)[]
    const sendEmail = sanitizeRecipients(rawEmail.filter((e): e is string => typeof e === 'string'))
    return { enabled, saveFile, sendEmail: sendEmail.length > 0 ? sendEmail : undefined }
}
```

- [ ] **Step 2:** Build the run descriptor from parsed input:

```typescript
export const accountList = async (serviceRegistry: ServiceRegistry, input: StdAccountListInput) => {
    const { log, reports, res } = serviceRegistry
    const tracker = new AggregationTracker()
    const dryRun = parseDryRunInput(input)

    const descriptor: RunDescriptor = dryRun
        ? {
              persistence: false,
              outputPolicy: { keepAlive: 'memory' },
              dryRunOptions: { saveFile: dryRun.saveFile ?? false, sendEmail: dryRun.sendEmail },
          }
        : {
              persistence: true,
              outputPolicy: { keepAlive: 'memory' },
          }

    try {
        log.info(dryRun ? 'Starting dry-run analysis' : 'Starting aggregation')
        const result = await executeRun(serviceRegistry, descriptor, input.schema, tracker)

        if (!result.shouldContinue) return

        // Dry-run: send terminal summary
        if (dryRun && result.fetchResult) {
            const summary = buildTerminalSummary(serviceRegistry, result, dryRun)
            res.send(summary)
        }

        const label = dryRun ? 'Dry-run analysis' : 'Account list operation'
        result.timer.end(
            `✓ ${label} completed successfully - ${result.outputCount ?? 0} account(s) processed`
        )
    } catch (error) {
        if (error instanceof ConnectorError) throw error
        throw error
    }
}
```

- [ ] **Step 3:** Implement `buildTerminalSummary` — extract surviving summary data from the now-deleted `buildDryRunSummary` (counts, timing, issue summary, report paths). Keep only the fields not tied to row enrichment/categorization:

```typescript
function buildTerminalSummary(
    serviceRegistry: ServiceRegistry,
    result: PipelineRunResult,
    dryRun: DryRunInput
): Record<string, unknown> {
    const { log } = serviceRegistry
    const issueSummary = log.getAggregationIssueSummary()
    return {
        rowsSent: result.outputCount ?? 0,
        identitiesFound: result.fetchResult?.identitiesFound ?? 0,
        managedAccountsFound: result.fetchResult?.managedAccountsFound ?? 0,
        totalProcessingTime: result.timer.totalElapsed(),
        phaseTiming: result.timer.getPhaseBreakdown(),
        issueSummary,
        options: { saveFile: dryRun.saveFile, sendEmail: Boolean(dryRun.sendEmail) },
    }
}
```

- [ ] **Step 4:** Add saveFile delegation — after the summary build, if `dryRun.saveFile`:

```typescript
if (dryRun?.saveFile) {
    const dir = await reports.ensureReportOutputDirectoryExists()
    const hostSeg = hostnameSegmentFromBaseurl(serviceRegistry.config.baseurl)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const summaryPath = `${dir}/dry-run-${hostSeg}-${stamp}.json`
    await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
    log.info(`Dry-run summary written to ${summaryPath}`)
}
```

- [ ] **Step 5:** Run tests:

```bash
npx vitest run src/operations/__tests__/accountList.test.ts 2>&1 | tail -20
```

- [ ] **Step 6:** Commit

```bash
git add src/operations/accountList.ts
git commit -m "feat: add dryRun input parameter to accountList operation"
```

---

## Task 5: Delete dryRun command and helpers

**Files:**
- Delete: `src/operations/dryRun.ts`
- Delete: `src/operations/helpers/dryRunHelpers.ts`
- Delete: `src/operations/helpers/buildDryRunPayload.ts`
- Delete: `src/operations/__tests__/dryRun.test.ts`
- Delete: `src/operations/helpers/__tests__/dryRunHelpers.test.ts` (if exists)
- Delete: `src/operations/helpers/__tests__/buildDryRunPayload.test.ts` (if exists)
- Modify: `src/index.ts`
- Modify: `connector-spec.json`

**Interfaces:**
- Consumes: dry-run logic now lives in accountList
- Produces: clean deletion of ~1,400 lines + command registration

- [ ] **Step 1:** Remove `custom:dryrun` registration from `src/index.ts`:

Delete lines importing and registering dryRun:
```typescript
// DELETE:
import { dryRun } from './operations/dryRun'

// DELETE the entire .command() block:
.command(
    'custom:dryrun',
    createOperationHandler('custom:dryrun', dryRun, config, {
        errorMessage: 'Failed to run custom:dryrun',
        keepAlive: 'simple',
        keepAliveIntervalMs: 15_000,
    })
)
```

- [ ] **Step 2:** Remove `custom:dryrun` from `connector-spec.json` commands array.

- [ ] **Step 3:** Delete the four source files:

```bash
rm src/operations/dryRun.ts
rm src/operations/helpers/dryRunHelpers.ts
rm src/operations/helpers/buildDryRunPayload.ts
rm src/operations/__tests__/dryRun.test.ts
rm -f src/operations/helpers/__tests__/dryRunHelpers.test.ts
rm -f src/operations/helpers/__tests__/buildDryRunPayload.test.ts
```

- [ ] **Step 4:** Clean up any remaining imports to deleted files elsewhere:

```bash
npm run build 2>&1 | head -30
```

Fix any compilation errors from dangling imports. Key places to check:
- `src/operations/helpers/corePipeline.ts` — remove `generateReport` import if it was only used by dryRun's report path
- `src/services/reportService.ts` — `DryRunRuntimeOptions` type may still be imported/used

- [ ] **Step 5:** Remove dead `DryRunRuntimeOptions` type references from `reportService.ts` (cleanup before Task 6):

```bash
grep -rn "DryRunRuntimeOptions|setDryRunRuntimeOptions|dryRunRuntimeOptions" src/ --include="*.ts"
```

Note positions for Task 6 cleanup.

- [ ] **Step 6:** Commit

```bash
git add src/operations/dryRun.ts src/operations/helpers/dryRunHelpers.ts src/operations/helpers/buildDryRunPayload.ts src/operations/__tests__/dryRun.test.ts src/index.ts connector-spec.json
git commit -m "feat: delete custom:dryrun command and helpers (~1400 lines)"
```

---

## Task 6: Update report service — dry-run delivery

**Files:**
- Modify: `src/services/reportService.ts`

**Interfaces:**
- Consumes: dry-run options from accountList input (not from `setDryRunRuntimeOptions`)
- Produces: `writeAndSendDryRunReport` takes explicit `saveFile`/`sendEmail` params; `includeNonMatches: false` fixed

- [ ] **Step 1:** Remove the `dryRunRuntimeOptions` field and `setDryRunRuntimeOptions` method:

```typescript
// DELETE:
private dryRunRuntimeOptions: DryRunRuntimeOptions = {}
public setDryRunRuntimeOptions(runtimeOptions: DryRunRuntimeOptions): void {
    this.dryRunRuntimeOptions = { ...runtimeOptions }
}
```

- [ ] **Step 2:** Refactor `writeAndSendDryRunReport` to accept options directly:

```typescript
public async writeAndSendDryRunReport(args: {
    report: FusionReport
    finalDryRunStats: AggregationStats
    reportPhaseStartedAt?: number
    saveFile?: boolean
    sendEmail?: string | string[]
}): Promise<{ reportHtmlOutputPath?: string; statsWithPhaseTiming: AggregationStats }> {
    const { report, finalDryRunStats, reportPhaseStartedAt, saveFile, sendEmail } = args
    const shouldWriteHtmlReport = saveFile ?? true
    const recipients = Array.isArray(sendEmail) ? sendEmail : (sendEmail ? [sendEmail] : [])
    const shouldSendReportEmail = recipients.length > 0
    // ... rest unchanged, but replace runtimeOptions.writeToDisk with saveFile,
    //     runtimeOptions.sendReportTo with recipients
}
```

- [ ] **Step 3:** Fix `includeNonMatches` in `initializeDryRunReport` — remove the parameter, hardcode `false`:

```typescript
public initializeDryRunReport(args: {
    fetchResult?: any
    totalProcessingTime?: string
    phaseTiming?: any
}): { report: FusionReport; stats: AggregationStats } {
    // ...
    const report = this.fusion.generateReport(tracker, false, stats)  // was: args.includeNonMatches ?? true
    return { report, stats }
}
```

- [ ] **Step 4:** Run `reportService.test.ts`:

```bash
npx vitest run src/services/__tests__/reportService.test.ts 2>&1 | tail -30
```

- [ ] **Step 5:** Commit

```bash
git add src/services/reportService.ts
git commit -m "refactor: ReportService accepts dry-run options directly, includeNonMatches=false"
```

---

## Task 7: Update downstream consumers (OperationContext removal)

**Files:**
- Modify: `src/model/operationContext.ts`
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/accountAssembly/accountAssembly.ts`
- Modify: `src/services/serviceRegistry.ts`

**Interfaces:**
- Consumes: `RunDescriptor` from Task 2
- Produces: `OperationContext` enum deleted; consumers check descriptor or a simple `isAggregationMode` flag

- [ ] **Step 1:** In `fusionService.ts`, update `shouldCaptureManagedAccountReportData`:

The method currently gates on `this.operationContext === OperationContext.CustomDryRun`. Replace with a constructor flag:

```typescript
// In constructor:
private readonly shouldCaptureReportData: boolean

constructor(/* existing params */, shouldCaptureReportData: boolean) {
    // ...
    this.shouldCaptureReportData = shouldCaptureReportData
}

// In shouldCaptureManagedAccountReportData:
private shouldCaptureManagedAccountReportData(): boolean {
    return this.fusionReportOnAggregation || this.shouldCaptureReportData
}
```

- [ ] **Step 2:** In `accountAssembly.ts`, update `isAggregationAccountListMode`:

Replace `this.deps.operationContext === OperationContext.AccountList` with a boolean field:

```typescript
// In AccountAssemblyDeps interface:
isAggregationMode: boolean  // replaces operationContext

// In isAggregationAccountListMode method:
private isAggregationAccountListMode(): boolean {
    return this.deps.isAggregationMode
}
```

- [ ] **Step 3:** In `serviceRegistry.ts`, update the constructor:

Remove `operationContext` parameter (or replace with `isAggregationMode: boolean` derived from the descriptor). Update `FusionService` and `AccountAssembly` construction to pass the flag instead of `OperationContext`.

- [ ] **Step 4:** Delete `src/model/operationContext.ts`:

```bash
rm src/model/operationContext.ts
```

- [ ] **Step 5:** Run tests:

```bash
npm test 2>&1 | tail -40
```

Fix any test compilation errors from the removed enum references.

- [ ] **Step 6:** Commit

```bash
git add src/model/operationContext.ts src/services/fusionService/fusionService.ts src/services/accountAssembly/accountAssembly.ts src/services/serviceRegistry.ts
git commit -m "refactor: remove OperationContext enum — replaced by boolean flags from RunDescriptor"
```

---

## Task 8: Rewrite tests

**Files:**
- Modify: `src/operations/helpers/__tests__/corePipeline.test.ts`
- Modify: `src/operations/__tests__/accountList.test.ts`
- Modify: `src/operations/__tests__/harness/operationTestRegistry.ts`
- Modify: `src/operations/__tests__/harness/testRegistry.ts`
- Modify: `src/services/__tests__/reportService.test.ts`

**Interfaces:**
- Consumes: `executeRun` + `RunDescriptor` from Task 2; accountList with dryRun input from Task 4
- Produces: tests exercising aggregation and dry-run modes through the verb interface

- [ ] **Step 1:** Rewrite `corePipeline.test.ts` (450L). Replace individual phase-function tests with `executeRun` tests that exercise the descriptor-based pipeline:

```typescript
describe('executeRun (aggregation)', () => {
    it('runs all phases for a persistent aggregation', async () => {
        const registry = createRegistry() // from existing test harness
        const result = await executeRun(registry, {
            persistence: true,
            outputPolicy: { keepAlive: 'memory' },
        })
        expect(result.shouldContinue).toBe(true)
        expect(result.fetchResult).toBeDefined()
    })
})

describe('executeRun (dry-run)', () => {
    it('runs phases 1-4 and stops at process', async () => {
        const registry = createRegistry()
        const result = await executeRun(registry, {
            persistence: false,
            outputPolicy: { keepAlive: 'memory' },
            stopAfter: 'process',
        })
        expect(result.shouldContinue).toBe(true)
        expect(result.fetchResult).toBeDefined()
        // outputPhase should NOT have been reached
    })
})
```

- [ ] **Step 2:** Add dry-run mode scenarios to `accountList.test.ts` using the existing scenario harness (`operationTestRegistry`, `aggregationScenarios`):

```typescript
describe('accountList — dry-run mode', () => {
    it('streams 1-to-1 StdAccountListOutput rows', async () => {
        const scenario = createAggregationScenario({ /* ... */ })
        const registry = createTwoSweepRegistry(scenario)
        const input: any = {
            dryRun: { enabled: true },
            schema: { /* ... */ },
        }
        await accountList(registry, input)
        // Assert: rows sent via res.send are plain StdAccountListOutput
        // Assert: terminal summary was sent
    })
})
```

- [ ] **Step 3:** Remove `reports.setDryRunRuntimeOptions` and `reports.writeAndSendDryRunReport` mocks from `operationTestRegistry.ts` — replaced by direct `writeAndSendDryRunReport` with explicit params.

- [ ] **Step 4:** Update `reportService.test.ts` — `writeAndSendDryRunReport` call with explicit `saveFile`/`sendEmail` params instead of `setDryRunRuntimeOptions` setup.

- [ ] **Step 5:** Run the full test suite:

```bash
npm test 2>&1 | tail -60
```

Fix any failures. Known likely issues: test harnesses referencing deleted `OperationContext`, phase function imports in old tests.

- [ ] **Step 6:** Commit

```bash
git add src/operations/helpers/__tests__/corePipeline.test.ts src/operations/__tests__/accountList.test.ts src/operations/__tests__/harness/ src/services/__tests__/reportService.test.ts
git commit -m "test: rewrite tests for executeRun + accountList dry-run mode"
```

---

## Task 9: Documentation updates

**Files:**
- Modify: `README.md`
- Delete: `docs/operations/custom-dryrun.md`
- Modify: `docs/guides/match.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: user-facing docs reflecting dry-run mode

- [ ] **Step 1:** Rewrite `README.md` §"Custom command: custom:dryrun" (L310-351) → "Dry-run mode":

```markdown
## Dry-run mode

`std:account:list` supports an optional dry-run mode for non-persistent aggregation analysis.
Pass `{ dryRun: { enabled: true } }` on the input to run the full Map, Define, and Match
pipeline without persisting state changes, form updates, or aggregation scheduling.

### Input options

- `enabled` (boolean, required): Set to `true` to activate dry-run mode.
- `saveFile` (boolean, optional): Write the terminal summary and HTML report to `./reports/`.
- `sendEmail` (string or string[], optional): Deliver the dry-run report to the specified recipients.

All rows are 1-to-1 `StdAccountListOutput`, identical to aggregation rows. Analysis detail
(match, deferred, non-match data) lives in the HTML report and terminal summary.

### Migration from `custom:dryrun`

The `custom:dryrun` command is removed. Replace invocations:
- **Before:** `custom:dryrun` with `includeExisting`/`includeMatched`/`writeToDisk`/`sendReportTo` flags
- **After:** `std:account:list` with `{ dryRun: { enabled: true, saveFile: true, sendEmail: [...] } }`
```

- [ ] **Step 2:** Delete `docs/operations/custom-dryrun.md`.

- [ ] **Step 3:** Update `docs/guides/match.md` — replace `custom:dryrun` references (L212, L282) with dry-run mode invocation.

- [ ] **Step 4:** Append to `CHANGELOG.md`:

```markdown
## 10.0.0 (2026-07-23)

### Breaking Changes

- **`custom:dryrun` command removed.** Dry-run analysis is now a mode of `std:account:list`.
  Set `{ dryRun: { enabled: true } }` on the input. Output rows are 1-to-1 `StdAccountListOutput`
  (no `matchingStatus`/`reportCategories`/`review` decorations). Analysis detail lives in the
  HTML report (`saveFile: true`) or email (`sendEmail`). See README §"Dry-run mode" for migration.
```

- [ ] **Step 5:** Commit

```bash
git add README.md docs/operations/custom-dryrun.md docs/guides/match.md CHANGELOG.md
git commit -m "docs: dry-run mode migration, custom:dryrun removal"
```

---

## Task 10: Final verification

**Files:** (none — verification only)

- [ ] **Step 1:** Build:

```bash
npm run build
```

Expected: clean compilation, no errors.

- [ ] **Step 2:** Lint:

```bash
npm run lint
```

Expected: no ESLint or knip violations. If knip flags dead code, verify and clean up.

- [ ] **Step 3:** Full test suite:

```bash
npm test
```

Expected: all tests pass (existing tests + new dry-run mode scenario tests).

- [ ] **Step 4:** Visual diff — verify line-count reduction:

```bash
echo "Lines deleted:" && git diff --stat HEAD~10 | grep -E "dryRun|buildDryRun|dryRunHelpers|corePipeline|operationContext" 
```

Expected: ~1,400 lines net deletion.

- [ ] **Step 5:** Manual check — verify `custom:dryrun` is no longer registered:

```bash
grep -r "custom:dryrun" src/ connector-spec.json 2>/dev/null
```

Expected: no output (all references removed from production code; documentation only in README/CHANGELOG migration notes).

- [ ] **Step 6:** Commit verification results if any cleanups were needed.
