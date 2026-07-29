import * as fs from 'fs'
import * as path from 'path'
import { LogService } from './logService'
import { FusionRun } from '../model/fusionRun'
import { FusionConfig, RecordingConfig } from '../model/config'
import { ApiLogEntry } from './clientService/recordingApiAdapter'
import { sanitizeForJson } from '../utils/sanitizeForJson'
import {
    getOrCreateRecordingStore,
    RecordingManifest,
    RecordingStore,
    clearRecordingStoreCache,
} from './recordingService/recordingStore'
import { allocateStepIndex, bootstrapStepCounter } from './recordingService/recordingStepCounter'

interface RecordedStep {
    stepId: string
    operation: string
    sweep?: number
    input: unknown
    output: unknown[]
    stateAfter: any
    timestamp: string
    duration: number
}

export interface PhaseRecord {
    phaseNumber: number
    phase: string
    detail?: Record<string, unknown>
    elapsedMs?: number
    timestamp: string
    managedAccounts?: number
    fusionAccounts?: number
    apiCalls?: number
}

const finalizedChains = new Set<string>()
const chainsToFinalize = new Set<string>()
const chainConfigs = new Map<string, FusionConfig>()
const chainLogs = new Map<string, LogService>()
let exitHandlersRegistered = false

function shouldRegisterExitHandlers(): boolean {
    return process.env.VITEST !== 'true' && process.env.VITEST !== '1'
}

function registerExitHandlersOnce(): void {
    if (exitHandlersRegistered || !shouldRegisterExitHandlers()) return
    exitHandlersRegistered = true

    const finalizeAll = async (): Promise<void> => {
        for (const chainName of chainsToFinalize) {
            const config = chainConfigs.get(chainName)
            const log = chainLogs.get(chainName)
            if (config && log) {
                await finalizeRecordingChain(chainName, config, log)
            }
        }
    }

    process.on('SIGINT', async () => {
        await finalizeAll()
        process.exit(0)
    })
    process.on('SIGTERM', async () => {
        await finalizeAll()
        process.exit(0)
    })
    process.on('beforeExit', () => {
        void finalizeAll()
    })
}

function loadStepsFromDisk(store: RecordingStore): RecordedStep[] {
    const stepsFile = path.join(store.getRecordingDir(), 'steps.ndjson')
    if (!fs.existsSync(stepsFile)) return []

    const byId = new Map<string, RecordedStep>()
    for (const line of fs.readFileSync(stepsFile, 'utf-8').trim().split('\n')) {
        if (!line) continue
        try {
            const step = JSON.parse(line) as RecordedStep
            byId.set(step.stepId, step)
        } catch {
            /* skip malformed lines */
        }
    }

    return Array.from(byId.values()).sort((a, b) => {
        const na = parseInt(a.stepId.replace('step-', ''), 10)
        const nb = parseInt(b.stepId.replace('step-', ''), 10)
        return na - nb
    })
}

function buildScenario(chainName: string, config: FusionConfig, store: RecordingStore, steps: RecordedStep[]): Record<string, unknown> {
    const firstStep = steps[0]
    const firstState = firstStep?.stateAfter
    const initialState = firstState
        ? {
              identities: firstState.identities,
              managedAccounts: firstState.managedAccounts,
              fusionAccounts: firstState.fusionAccounts,
              fusionIdentityDecisions: firstState.fusionIdentityDecisions,
          }
        : {
              identities: [],
              managedAccounts: [],
              fusionAccounts: [],
              fusionIdentityDecisions: [],
          }

    const scenarioSteps = steps.map((step) => ({
        id: step.stepId,
        operation: step.operation,
        sweep: step.sweep,
        description: `Recorded ${step.operation} — ${step.duration}ms, ${step.output.length} outputs`,
        input: step.input as Record<string, unknown>,
        expectedOutput: step.output.length > 0 ? (step.output.length === 1 ? step.output[0] : step.output) : undefined,
        expectedStateDelta: step.stateAfter,
    }))

    const referenceValues: Record<string, Record<string, unknown>> = {}
    for (const step of steps) {
        referenceValues[step.stepId] = {
            outputCount: step.output.length,
            durationMs: step.duration,
            managedAccountsCount: step.stateAfter.managedAccounts.length,
            fusionAccountsCount: step.stateAfter.fusionAccounts.length,
            identitiesCount: step.stateAfter.identities.length,
            fusionIdentityDecisionsCount: step.stateAfter.fusionIdentityDecisions.length,
        }
    }

    return {
        version: '1.0.0',
        recordedAt: new Date().toISOString(),
        chainName,
        config: sanitizeForJson(config),
        initialState,
        steps: scenarioSteps,
        referenceValues,
        apiLogPath: path.relative(process.cwd(), store.getApiLogPath()),
    }
}

/** Finalizes a chain from on-disk artifacts (one call per chain per process). */
export async function finalizeRecordingChain(
    chainName: string,
    config: FusionConfig,
    log: LogService,
    reportsPath?: string
): Promise<string> {
    if (finalizedChains.has(chainName)) return ''
    finalizedChains.add(chainName)

    const recConfig: RecordingConfig = config.recording ?? { mode: 'off', store: 'ndjson' }
    const store = getOrCreateRecordingStore(recConfig, chainName)
    await store.flush()

    const dir = store.getRecordingDir()
    fs.mkdirSync(dir, { recursive: true })

    const steps = loadStepsFromDisk(store)
    const scenario = buildScenario(chainName, config, store, steps)
    const scenarioPath = path.join(dir, 'scenario.json')
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')

    const apiLogPath = store.getApiLogPath()
    const stepsPath = path.join(dir, 'steps.ndjson')
    const phasesPath = path.join(dir, 'phases.ndjson')
    const artifactPaths = [
        path.relative(process.cwd(), scenarioPath),
        path.relative(process.cwd(), apiLogPath),
        path.relative(process.cwd(), stepsPath),
    ]
    if (fs.existsSync(phasesPath)) {
        artifactPaths.push(path.relative(process.cwd(), phasesPath))
    }
    if (reportsPath) {
        artifactPaths.push(path.relative(process.cwd(), reportsPath))
    }

    const manifest: RecordingManifest = {
        version: '1.0.0',
        store: recConfig.store ?? 'ndjson',
        chainName,
        recordedAt: new Date().toISOString(),
        apiLogPath: path.relative(process.cwd(), apiLogPath),
        apiLogEntryCount: store.getApiLogEntryCount(),
        stepsPath: path.relative(process.cwd(), stepsPath),
        stepCount: steps.length,
        phasesPath: fs.existsSync(phasesPath) ? path.relative(process.cwd(), phasesPath) : undefined,
        phaseCount: store.getPhaseCount(),
        scenarioPath: path.relative(process.cwd(), scenarioPath),
        reportsPath: reportsPath ? path.relative(process.cwd(), reportsPath) : undefined,
        artifactPaths,
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    store.close()

    log.info(`Recording "${chainName}" finalized — ${steps.length} steps, ${manifest.apiLogEntryCount} api-log entries → ${scenarioPath}`)
    return scenarioPath
}

/** Captures ISC API calls and operation steps for chain replay scenarios. */
export class RecordingService {
    private readonly chainName: string
    private readonly store: RecordingStore
    private readonly steps: RecordedStep[] = []
    private currentStep: RecordedStep | null = null

    constructor(
        private readonly log: LogService,
        private readonly config: FusionConfig
    ) {
        const recConfig: RecordingConfig = config.recording ?? { mode: 'off', store: 'ndjson' }
        this.chainName = recConfig.chainName ?? `recording-${Date.now()}`
        this.store = getOrCreateRecordingStore(recConfig, this.chainName)
        this.log.info(`RecordingService initialized — chain "${this.chainName}"`)

        const stepsFile = path.join(this.store.getRecordingDir(), 'steps.ndjson')
        bootstrapStepCounter(this.store.getRecordingDir(), stepsFile)

        chainsToFinalize.add(this.chainName)
        chainConfigs.set(this.chainName, config)
        chainLogs.set(this.chainName, log)
        registerExitHandlersOnce()
    }

    getStore(): RecordingStore {
        return this.store
    }

    getName(): string {
        return this.chainName
    }

    getRecordingDir(): string {
        return this.store.getRecordingDir()
    }

    onApiCall(entry: ApiLogEntry): void {
        this.store.appendApiCall(entry)
    }

    recordPhaseEnd(record: PhaseRecord): void {
        this.store.append('phases', record)
    }

    writeAggregationReport(report: unknown): void {
        const reportsDir = path.join(this.store.getRecordingDir(), 'reports')
        fs.mkdirSync(reportsDir, { recursive: true })
        const reportPath = path.join(reportsDir, 'aggregation.json')
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
    }

    getStepCount(): number {
        return this.steps.length
    }

    getSteps(): RecordedStep[] {
        return [...this.steps]
    }

    startOperation(
        operation: string,
        input: unknown,
        res: { send: (value: unknown) => void },
        run: FusionRun
    ): void {
        const stepIndex = allocateStepIndex(this.store.getRecordingDir())
        this.currentStep = {
            stepId: `step-${stepIndex}`,
            operation,
            sweep: operation === 'accountList' ? stepIndex : undefined,
            input: sanitizeForJson(input),
            output: [],
            stateAfter: run.snapshot() as any,
            timestamp: new Date().toISOString(),
            duration: 0,
        }

        const originalSend = res.send.bind(res)
        res.send = (value: unknown) => {
            this.currentStep?.output.push(sanitizeForJson(value))
            originalSend(value)
        }

        this.log.debug(`Recording step ${stepIndex}: ${operation}`)
        if (this.config.recording?.verbose === true) {
            const sweepInfo = this.currentStep.sweep ? ` (sweep ${this.currentStep.sweep})` : ''
            console.log(`[Recording] → ${operation}${sweepInfo} started`)
        }
    }

    endOperation(run: FusionRun): void {
        if (!this.currentStep) return

        this.currentStep.stateAfter = run.snapshot() as any
        this.currentStep.duration = Date.now() - new Date(this.currentStep.timestamp).getTime()
        this.steps.push({ ...this.currentStep })
        this.store.append('steps', this.currentStep)

        this.log.debug(
            `Recorded step ${this.currentStep.stepId} — ${this.currentStep.output.length} output(s), ${this.currentStep.duration}ms`
        )
        if (this.config.recording?.verbose === true) {
            const sweepInfo = this.currentStep.sweep ? ` (sweep ${this.currentStep.sweep})` : ''
            console.log(
                `[Recording] ← ${this.currentStep.operation}${sweepInfo} completed — ${this.currentStep.duration}ms, ${this.currentStep.output.length} outputs`
            )
        }
        this.currentStep = null
    }

    /** Writes scenario.json and manifest.json once per chain; retains steps.ndjson. */
    async finalizeOnce(): Promise<string> {
        const reportsPath = fs.existsSync(path.join(this.store.getRecordingDir(), 'reports', 'aggregation.json'))
            ? path.join(this.store.getRecordingDir(), 'reports', 'aggregation.json')
            : undefined
        return finalizeRecordingChain(this.chainName, this.config, this.log, reportsPath)
    }
}

/** Resets finalize/cache state (for tests). */
export function resetRecordingLifecycleForTests(): void {
    finalizedChains.clear()
    chainsToFinalize.clear()
    chainConfigs.clear()
    chainLogs.clear()
    exitHandlersRegistered = false
    clearRecordingStoreCache()
}
