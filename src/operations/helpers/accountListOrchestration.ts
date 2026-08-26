import { LogService, PhaseTimer } from '../../services/logService'
import { OperationPhase } from '../../services/logService/operationRunContext'
import { AggregationTracker } from '../../services/fusionService'
import { ServiceRegistry } from '../../services/serviceRegistry'
import {
    fetchPhase,
    outputPhase,
    processPhase,
    refreshPhase,
    setupPhase,
    type FetchResult,
    type PhaseOptions,
} from './accountListPhases'
import { createEmptyFetchResult } from './accountListHelpers'

export interface PhaseRunResult {
    fetchResult?: FetchResult
    outputCount?: number
    /** false when setupPhase exits early (reset accounts) */
    continued: boolean
}

export interface RunPhasesOptions {
    log: LogService
    timer: PhaseTimer
    /** Emit PHASE START/END lines (true for accountList, false for buildReportContext) */
    logPhases?: boolean
    /** When provided, updated incrementally so partial results survive mid-pipeline failures */
    result?: PhaseRunResult
}

export interface RunAccountListPhasesInput extends PhaseOptions {
    schema?: unknown
    throughPhase?: 4 | 5
}

async function runLoggedPhase<T>(
    log: LogService,
    timer: PhaseTimer,
    phaseNumber: number,
    phaseName: OperationPhase,
    fn: () => Promise<T>
): Promise<T> {
    log.phaseStart(phaseNumber, phaseName)
    const started = Date.now()
    try {
        return await fn()
    } finally {
        timer.recordElapsed(phaseName, Date.now() - started)
        log.phaseEnd(phaseNumber, phaseName, log.flushPhaseCorrelationSummary())
    }
}

async function runTimedPhase<T>(timer: PhaseTimer, phaseName: OperationPhase, fn: () => Promise<T>): Promise<T> {
    const started = Date.now()
    try {
        return await fn()
    } finally {
        timer.recordElapsed(phaseName, Date.now() - started)
    }
}

/** Runs phases 1–5 (accountList) or 1–4 (buildReportContext). */
export async function runAccountListPhases(
    serviceRegistry: ServiceRegistry,
    options: RunAccountListPhasesInput,
    runOptions: RunPhasesOptions
): Promise<PhaseRunResult> {
    const { log, timer, logPhases = true, result: resultOut } = runOptions
    const { schema, throughPhase = 5, ...phaseOptions } = options
    const result: PhaseRunResult = resultOut ?? { continued: true }

    const run = logPhases
        ? <T>(phaseNumber: number, phaseName: OperationPhase, fn: () => Promise<T>) =>
              runLoggedPhase(log, timer, phaseNumber, phaseName, fn)
        : <T>(_phaseNumber: number, phaseName: OperationPhase, fn: () => Promise<T>) =>
              runTimedPhase(timer, phaseName, fn)

    const setupOk = await run(1, 'Setup', () => setupPhase(serviceRegistry, schema, phaseOptions))
    if (!setupOk) {
        result.continued = false
        return result
    }

    result.fetchResult = await run(2, 'Fetch', () => fetchPhase(serviceRegistry, phaseOptions))
    await run(3, 'Refresh', () => refreshPhase(serviceRegistry))
    await run(4, 'Process', () => processPhase(serviceRegistry, phaseOptions))

    if (throughPhase === 5) {
        result.outputCount = await run(5, 'Output', () => outputPhase(serviceRegistry, phaseOptions))
    }

    result.continued = true
    return result
}

/**
 * Self-contained setup + fetch + process for Fusion report (`report` action).
 * Runs phases 1–4 (`throughPhase: 4`) so Output does not stream account-list rows.
 * Callers activate dry-run before this so Match uses the account-list outcome tree.
 */
export async function buildReportContext(serviceRegistry: ServiceRegistry): Promise<{
    fetchResult: FetchResult
    timer: PhaseTimer
}> {
    const { log } = serviceRegistry
    const timer = log.timer()
    const phaseResult = await runAccountListPhases(
        serviceRegistry,
        { isPersistent: false, schema: undefined, throughPhase: 4, tracker: new AggregationTracker() },
        { log, timer, logPhases: false }
    )
    if (!phaseResult.continued) {
        return { fetchResult: createEmptyFetchResult(), timer }
    }
    return { fetchResult: phaseResult.fetchResult!, timer }
}
