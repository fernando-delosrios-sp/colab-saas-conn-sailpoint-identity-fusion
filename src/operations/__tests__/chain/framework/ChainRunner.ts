import * as fs from 'fs'
import * as path from 'path'
import { ChainState, StepResult, ChainFusionAccount } from './ChainState'
import { ChainContext } from './ChainContext'
import { createChainMockRegistry } from '../harness/chainMockDelegate'
import { executeStep as executeOperationStep } from '../steps/stepDefinitions'

export interface ScenararioConfig {
    sources?: Array<Record<string, unknown>>
    uniqueAttributeDefinitions?: Array<Record<string, unknown>>
    normalAttributeDefinitions?: Array<Record<string, unknown>>
    attributeMaps?: Array<Record<string, unknown>>
    matchingConfigs?: Array<Record<string, unknown>>
    fusionAverageScore?: number
    fusionMergingExactMatch?: boolean
    fusionOwnerIsGlobalReviewer?: boolean
    fusionFormExpirationDays?: number
    includeIdentities?: boolean
    deleteEmpty?: boolean
    skipAccountsWithMissingId?: boolean
    maxHistoryMessages?: number
    reset?: boolean
    forceAttributeRefresh?: boolean
    [key: string]: unknown
}

export interface StepDefinition {
    id: string
    operation: string
    pass?: number
    description?: string
    input?: Record<string, unknown>
    mockDelegate?: string
    expectedOutput?: Record<string, unknown>
    expectedStateDelta?: Record<string, unknown>
}

export interface ChainScenario {
    version: string
    config: ScenararioConfig
    initialState: Record<string, unknown>
    steps: StepDefinition[]
    referenceValues?: Record<string, Record<string, unknown>>
}

export interface ChainResult {
    success: boolean
    stepsExecuted: number
    stepsFailed: number
    stepResults: StepResult[]
    finalState: Record<string, unknown>
}

export class ChainRunner {
    private scenario: ChainScenario
    private state: ChainState

    constructor(scenarioPath: string) {
        const resolved = path.isAbsolute(scenarioPath) ? scenarioPath : path.resolve(scenarioPath)
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'))

        this.scenario = raw as ChainScenario

        this.state = new ChainState({
            identities: (this.scenario.initialState.identities as any[]) ?? [],
            managedAccounts: (this.scenario.initialState.managedAccounts as Record<string, any[]>) ?? {},
            fusionAccounts: (this.scenario.initialState.fusionAccounts as any[]) ?? [],
            forms: (this.scenario.initialState.forms as any[]) ?? [],
        })
    }

    getSteps(): StepDefinition[] {
        return this.scenario.steps
    }

    getState(): ChainState {
        return this.state
    }

    getConfig(): ScenararioConfig {
        return this.scenario.config
    }

    getReferenceValues(): Record<string, Record<string, unknown>> {
        return this.scenario.referenceValues ?? {}
    }

    getReferenceForStep(stepId: string): Record<string, unknown> | undefined {
        return this.getReferenceValues()[stepId]
    }

    async executeStep(stepId: string): Promise<StepResult> {
        const step = this.scenario.steps.find((s) => s.id === stepId)
        if (!step) {
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

        const registry = createChainMockRegistry(this.scenario.config, step, this.state)

        const context: ChainContext = {
            registry,
            state: this.state,
            options: {
                pass: step.pass ?? 1,
                stepId: step.id,
            },
        }

        try {
            const output = await executeOperationStep(step, context)

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
        }
    }

    async executeAll(): Promise<ChainResult> {
        const results: StepResult[] = []
        let failed = 0

        for (const step of this.scenario.steps) {
            const result = await this.executeStep(step.id)
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

    async executeUpTo(stepId: string): Promise<ChainResult> {
        const results: StepResult[] = []
        let failed = 0

        for (const step of this.scenario.steps) {
            const result = await this.executeStep(step.id)
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

    private buildStateDelta(step: StepDefinition, output: unknown): Record<string, unknown> {
        const delta: Record<string, unknown> = {}

        if (step.expectedStateDelta) {
            Object.assign(delta, step.expectedStateDelta)
        }

        if (step.operation === 'accountList' && output) {
            const out = output as Record<string, unknown>
            if (out.fusionAccounts) {
                delta.fusionAccountsAdd = out.fusionAccounts
            }
            if (out.identities) {
                delta.identitiesAdd = out.identities
            }
        }

        if (step.operation === 'accountCreate' && output) {
            const out = output as Record<string, unknown>
            if (out.fusionAccount) {
                delta.fusionAccountsAdd = [out.fusionAccount]
            }
        }

        return delta
    }
}
