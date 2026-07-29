import * as fs from 'fs'
import * as path from 'path'
import { LogService } from './logService'
import { FusionRun } from '../model/fusionRun'
import { FusionConfig, RecordingConfig } from '../model/config'
import { ApiLogEntry } from './clientService/recordingApiAdapter'
import { sanitizeForJson } from '../utils/sanitizeForJson'
import { createRecordingStore, RecordingManifest, RecordingStore } from './recordingService/recordingStore'

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
let exitHandlersRegistered = false
const activeRecordingServices = new Set<RecordingService>()

function shouldRegisterExitHandlers(): boolean {
    return process.env.VITEST !== 'true' && process.env.VITEST !== '1'
}

function registerExitHandlersOnce(): void {
    if (exitHandlersRegistered || !shouldRegisterExitHandlers()) return
    exitHandlersRegistered = true

    const finalizeAll = async (): Promise<void> => {
        for (const service of activeRecordingServices) {
            await service.finalizeOnce()
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

/** Captures ISC API calls and operation steps for chain replay scenarios. */
export class RecordingService {
    private readonly chainName: string
    private readonly store: RecordingStore
    private readonly steps: RecordedStep[] = []
    private currentStep: RecordedStep | null = null
    private stepIndex = 0
    private reportsPath?: string

    constructor(
        private readonly log: LogService,
        private readonly config: FusionConfig
    ) {
        const recConfig: RecordingConfig = config.recording ?? { mode: 'off', store: 'ndjson' }
        this.chainName = recConfig.chainName ?? `recording-${Date.now()}`
        this.store = createRecordingStore(recConfig, this.chainName)
        this.log.info(`RecordingService initialized — chain "${this.chainName}"`)

        this.reloadSteps()
        activeRecordingServices.add(this)
        registerExitHandlersOnce()
    }

    private reloadSteps(): void {
        const stepsFile = path.join(this.store.getRecordingDir(), 'steps.ndjson')
        if (!fs.existsSync(stepsFile)) return

        try {
            const content = fs.readFileSync(stepsFile, 'utf-8').trim()
            if (!content) return
            for (const line of content.split('\n')) {
                if (!line) continue
                const step = JSON.parse(line) as RecordedStep
                this.steps.push(step)
                const match = step.stepId.match(/^step-(\d+)$/)
                if (match) {
                    const num = parseInt(match[1], 10)
                    if (num > this.stepIndex) this.stepIndex = num
                }
            }
            this.log.info(`Reloaded ${this.steps.length} previously-recorded step(s) from ${stepsFile}`)
        } catch (err) {
            this.log.warn(`Failed to reload steps from ${stepsFile}: ${err}`)
        }
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
        this.reportsPath = reportPath
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
        this.stepIndex++
        this.currentStep = {
            stepId: `step-${this.stepIndex}`,
            operation,
            sweep: operation === 'accountList' ? this.stepIndex : undefined,
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

        this.log.debug(`Recording step ${this.stepIndex}: ${operation}`)
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
        if (finalizedChains.has(this.chainName)) return ''
        finalizedChains.add(this.chainName)

        const dir = this.store.getRecordingDir()
        fs.mkdirSync(dir, { recursive: true })

        const scenario = this.buildScenario()
        const scenarioPath = path.join(dir, 'scenario.json')
        fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')

        const apiLogPath = this.store.getApiLogPath()
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
        if (this.reportsPath) {
            artifactPaths.push(path.relative(process.cwd(), this.reportsPath))
        }

        const manifest: RecordingManifest = {
            version: '1.0.0',
            store: this.config.recording?.store ?? 'ndjson',
            chainName: this.chainName,
            recordedAt: new Date().toISOString(),
            apiLogPath: path.relative(process.cwd(), apiLogPath),
            apiLogEntryCount: this.store.getApiLogEntryCount(),
            stepsPath: path.relative(process.cwd(), stepsPath),
            stepCount: this.steps.length,
            phasesPath: fs.existsSync(phasesPath) ? path.relative(process.cwd(), phasesPath) : undefined,
            phaseCount: this.store.getPhaseCount(),
            scenarioPath: path.relative(process.cwd(), scenarioPath),
            reportsPath: this.reportsPath ? path.relative(process.cwd(), this.reportsPath) : undefined,
            artifactPaths,
        }
        this.store.writeManifest(manifest)
        this.store.close()

        this.log.info(`Recording "${this.chainName}" finalized — ${this.steps.length} steps → ${scenarioPath}`)
        return scenarioPath
    }

    private buildScenario(): Record<string, unknown> {
        const firstStep = this.steps[0]
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

        const scenarioSteps = this.steps.map((step) => ({
            id: step.stepId,
            operation: step.operation,
            sweep: step.sweep,
            description: `Recorded ${step.operation} — ${step.duration}ms, ${step.output.length} outputs`,
            input: step.input as Record<string, unknown>,
            expectedOutput:
                step.output.length > 0 ? (step.output.length === 1 ? step.output[0] : step.output) : undefined,
            expectedStateDelta: step.stateAfter,
        }))

        const referenceValues: Record<string, Record<string, unknown>> = {}
        for (const step of this.steps) {
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
            chainName: this.chainName,
            config: sanitizeForJson(this.config),
            initialState,
            steps: scenarioSteps,
            referenceValues,
            apiLogPath: path.relative(process.cwd(), this.store.getApiLogPath()),
        }
    }
}
