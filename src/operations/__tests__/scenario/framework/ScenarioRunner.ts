import * as fs from 'fs'
import * as path from 'path'
import { ReplayApiAdapter } from '../../../../services/clientService/replayApiAdapter'
import { loadRecordingApiLog } from '../../../../services/recordingService/recordingStore'
import { sanitizeScenarioConfigForReplay, type ScenarioConfig } from '../../../scenarioReplay'
import { ChainState } from './ChainState'
import { ChainContext } from './ChainContext'

export interface StepDefinition {
    id: string
    operation: string
    sweep?: number
    description?: string
    input?: Record<string, unknown>
    expectedOutput?: unknown
    expectedStateDelta?: Record<string, unknown>
}

export interface ScenarioDefinition {
    version: string
    scenarioName?: string
    /** @deprecated Use scenarioName */
    chainName?: string
    recordedAt?: string
    config: ScenarioConfig
    initialState: Record<string, unknown>
    steps: StepDefinition[]
    referenceValues?: Record<string, Record<string, unknown>>
}

export interface StepResult {
    stepId: string
    operation: string
    success: boolean
    output: unknown
    stateDelta: Record<string, unknown>
    duration: number
    error?: string
}

export interface ScenarioResult {
    success: boolean
    stepsExecuted: number
    stepsFailed: number
    stepResults: StepResult[]
    finalState: Record<string, unknown>
}

function loadStepTimestamps(stepsPath: string): Record<string, string> {
    if (!fs.existsSync(stepsPath)) return {}

    const timestamps: Record<string, string> = {}
    for (const line of fs.readFileSync(stepsPath, 'utf-8').trim().split('\n')) {
        if (!line) continue
        try {
            const step = JSON.parse(line) as { stepId?: string; timestamp?: string }
            if (step.stepId && step.timestamp) {
                timestamps[step.stepId] = step.timestamp
            }
        } catch {
            /* skip malformed lines */
        }
    }
    return timestamps
}

export class ScenarioRunner {
    private scenario: ScenarioDefinition
    private state: ChainState
    private replayAdapter?: ReplayApiAdapter
    private stepTimestamps: Record<string, string>

    constructor(scenarioPath: string) {
        const resolved = path.isAbsolute(scenarioPath) ? scenarioPath : path.resolve(scenarioPath)
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'))

        this.scenario = raw as ScenarioDefinition
        this.scenario.config = sanitizeScenarioConfigForReplay(this.scenario.config)

        const chainDir = path.dirname(resolved)
        this.stepTimestamps = loadStepTimestamps(path.join(chainDir, 'steps.ndjson'))
        const baseurl = typeof this.scenario.config.baseurl === 'string' ? this.scenario.config.baseurl : undefined
        const apiLogEntries = loadRecordingApiLog(chainDir, baseurl)
        if (apiLogEntries.length > 0) {
            this.replayAdapter = new ReplayApiAdapter(apiLogEntries, this.scenario.config as any)
        }

        this.state = new ChainState({
            identities: (this.scenario.initialState.identities as any[]) ?? [],
            managedAccounts: (this.scenario.initialState.managedAccounts as Record<string, any[]>) ?? {},
            fusionAccounts: (this.scenario.initialState.fusionAccounts as any[]) ?? [],
            forms: (this.scenario.initialState.fusionIdentityDecisions as any[]) ?? [],
            finishedFusionDecisions: (this.scenario.initialState.finishedFusionDecisions as any[]) ?? [],
        })
    }

    getSteps(): StepDefinition[] {
        return this.scenario.steps
    }

    getState(): ChainState {
        return this.state
    }

    getConfig(): ScenarioConfig {
        return this.scenario.config
    }

    getReferenceValues(): Record<string, Record<string, unknown>> {
        return this.scenario.referenceValues ?? {}
    }

    getReferenceForStep(stepId: string): Record<string, unknown> | undefined {
        return this.getReferenceValues()[stepId]
    }

    async executeStep(stepOrId: StepDefinition | string): Promise<StepResult> {
        const step = typeof stepOrId === 'string'
            ? this.scenario.steps.find((s) => s.id === stepOrId)
            : stepOrId

        if (!step) {
            const stepId = typeof stepOrId === 'string' ? stepOrId : 'unknown'
            return {
                stepId,
                operation: 'unknown',
                success: false,
                output: undefined,
                stateDelta: {},
                duration: 0,
                error: `Step ${stepId} not found in scenario`,
            }
        }

        const startTime = Date.now()

        try {
            const stepFn = getStepFn(step.operation)
            if (!stepFn) {
                throw new Error(`No step function registered for operation: ${step.operation}`)
            }

            const context = this.buildContext(step)
            const output = await stepFn(step, context)

            const stateDelta = this.buildStateDelta(step, output)
            this.state.applyDelta(stateDelta)

            const result: StepResult = {
                stepId: step.id,
                operation: step.operation,
                success: true,
                output,
                stateDelta,
                duration: Date.now() - startTime,
            }

            this.state.recordStepResult(result)
            return result
        } catch (error) {
            const result: StepResult = {
                stepId: step.id,
                operation: step.operation,
                success: false,
                output: undefined,
                stateDelta: {},
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error),
            }

            this.state.recordStepResult(result)
            return result
        } finally {
            const registry = this.state.getServiceRegistry<{ run?: { clearSimulatedTime?: () => void } }>()
            registry?.run?.clearSimulatedTime?.()
        }
    }

    async executeAll(): Promise<ScenarioResult> {
        const results: StepResult[] = []
        let failed = 0

        for (const step of this.scenario.steps) {
            const result = await this.executeStep(step)
            results.push(result)
            if (!result.success) {
                failed++
            }
        }

        return {
            success: failed === 0,
            stepsExecuted: results.length,
            stepsFailed: failed,
            stepResults: results,
            finalState: this.state.getSnapshot(),
        }
    }

    async executeUpTo(stepId: string): Promise<ScenarioResult> {
        const results: StepResult[] = []
        let failed = 0

        for (const step of this.scenario.steps) {
            const result = await this.executeStep(step)
            results.push(result)
            if (!result.success) {
                failed++
            }
            if (step.id === stepId) {
                break
            }
        }

        return {
            success: failed === 0,
            stepsExecuted: results.length,
            stepsFailed: failed,
            stepResults: results,
            finalState: this.state.getSnapshot(),
        }
    }

    private buildContext(step: StepDefinition): ChainContext {
        return {
            registry: {},
            state: this.state,
            config: this.scenario.config as Record<string, unknown>,
            options: {
                sweep: step.sweep ?? 1,
                stepId: step.id,
                stepTimestamp: this.stepTimestamps[step.id],
            },
            scenario: this.scenario,
            replayAdapter: this.replayAdapter,
        } as unknown as ChainContext
    }

    private buildStateDelta(step: StepDefinition, _output: unknown): Record<string, unknown> {
        const delta: Record<string, unknown> = {}

        if (step.expectedStateDelta) {
            Object.assign(delta, step.expectedStateDelta)
        }

        return delta
    }
}

const stepFns = new Map<string, (step: StepDefinition, context: ChainContext) => Promise<unknown>>()

export function registerStepFn(
    operation: string,
    fn: (step: StepDefinition, context: ChainContext) => Promise<unknown>
): void {
    stepFns.set(operation, fn)
}

function getStepFn(operation: string): ((step: StepDefinition, context: ChainContext) => Promise<unknown>) | undefined {
    return stepFns.get(operation)
}



