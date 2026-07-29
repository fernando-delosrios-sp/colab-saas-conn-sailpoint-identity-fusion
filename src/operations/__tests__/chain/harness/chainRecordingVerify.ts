import { ChainRunner, registerStepFn, StepDefinition } from '../framework/ChainRunner'
import { ChainContext } from '../framework/ChainContext'
import { MockRegistry } from '../framework/ChainContext'
import { buildReplayContext, collectOutputs, compareOutputs } from './ReplayAdapter'
import { accountDiscoverSchema } from '../../../../operations/accountDiscoverSchema'
import { entitlementList } from '../../../../operations/entitlementList'
import { accountList } from '../../../../operations/accountList'
import { accountCreate } from '../../../../operations/accountCreate'
import { accountDisable } from '../../../../operations/accountDisable'
import { accountEnable } from '../../../../operations/accountEnable'
import { accountRead } from '../../../../operations/accountRead'
import { accountUpdate } from '../../../../operations/accountUpdate'

export interface StepVerifyResult {
    stepId: string
    operation: string
    success: boolean
    skippedComparison: boolean
    drift: string[]
    error?: string
}

export interface ChainVerifyResult {
    success: boolean
    stepsExecuted: number
    stepsFailed: number
    drifts: string[]
    stepResults: StepVerifyResult[]
}

let stepFnsRegistered = false

/** Registers all connector operation handlers used during chain replay verification. */
export function registerChainStepFns(): void {
    if (stepFnsRegistered) return
    stepFnsRegistered = true

    registerStepFn('accountDiscoverSchema', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountDiscoverSchema(registry as any)
        } catch (err) {
            console.error(`Error in accountDiscoverSchema for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('entitlementList', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await entitlementList(registry as any, (step.input ?? { type: 'status' }) as any)
        } catch (err) {
            console.error(`Error in entitlementList for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountList', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        context.state.setSweepIndex(step.sweep ?? 1)

        try {
            await accountList(registry as any, (step.input ?? { schema: { attributes: [] } }) as any)
            if (registry.log.crash.mock.calls.length > 0) {
                const call = registry.log.crash.mock.calls[0]
                console.error(`CRASH DETECTED in accountList for ${step.id}:`, call[0], call[1]?.stack || call[1])
            }
        } catch (err) {
            console.error(`Error in accountList for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            sweep: step.sweep,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountCreate', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountCreate(registry as any, (step.input ?? {}) as any)
        } catch (err) {
            console.error(`Error in accountCreate for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountDisable', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountDisable(registry as any, (step.input ?? {}) as any)
        } catch (err) {
            console.error(`Error in accountDisable for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountEnable', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountEnable(registry as any, (step.input ?? {}) as any)
        } catch (err) {
            console.error(`Error in accountEnable for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountRead', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountRead(registry as any, (step.input ?? {}) as any)
        } catch (err) {
            console.error(`Error in accountRead for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountUpdate', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        try {
            await accountUpdate(registry as any, (step.input ?? {}) as any)
            if (registry.log.crash.mock.calls.length > 0) {
                const call = registry.log.crash.mock.calls[0]
                console.error(`CRASH DETECTED in accountUpdate for ${step.id}:`, call[0], call[1]?.stack || call[1])
            }
        } catch (err) {
            console.error(`Error in accountUpdate for ${step.id}:`, err)
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })
}

/** Resets step registration (for tests that need a clean registry). */
export function resetChainStepFnsForTests(): void {
    stepFnsRegistered = false
}

/**
 * Executes all steps in a recorded scenario and compares outputs against goldens.
 * Returns structured pass/fail/drift results suitable for CLI or unit test assertions.
 */
export async function verifyChainRecording(scenarioPath: string): Promise<ChainVerifyResult> {
    registerChainStepFns()

    const runner = new ChainRunner(scenarioPath)
    const results = await runner.executeAll()
    const steps = runner.getSteps()
    const stepResults: StepVerifyResult[] = []
    const drifts: string[] = []

    for (let i = 0; i < results.stepResults.length; i++) {
        const stepResult = results.stepResults[i]
        const step = steps[i]
        const output = stepResult.output as Record<string, unknown> | undefined
        const actualOutputs = (output?.outputs as unknown[]) ?? []

        if (!stepResult.success) {
            stepResults.push({
                stepId: stepResult.stepId,
                operation: stepResult.operation,
                success: false,
                skippedComparison: true,
                drift: [],
                error: stepResult.error,
            })
            continue
        }

        if (!step?.expectedOutput) {
            stepResults.push({
                stepId: stepResult.stepId,
                operation: stepResult.operation,
                success: true,
                skippedComparison: true,
                drift: [],
            })
            continue
        }

        const { drift } = compareOutputs(actualOutputs, step.expectedOutput, `${stepResult.stepId} (index ${i})`)
        if (drift.length > 0) {
            drifts.push(...drift)
        }

        stepResults.push({
            stepId: stepResult.stepId,
            operation: stepResult.operation,
            success: drift.length === 0,
            skippedComparison: false,
            drift,
        })
    }

    return {
        success: results.success && results.stepsFailed === 0 && drifts.length === 0,
        stepsExecuted: results.stepsExecuted,
        stepsFailed: results.stepsFailed,
        drifts,
        stepResults,
    }
}

/** Prints a human-readable verification report to stdout. */
export function printChainVerifyReport(result: ChainVerifyResult, chainLabel: string): void {
    console.log('')
    console.log('Identity Fusion NG — Chain Recording Verification')
    console.log('=================================================')
    console.log(`Chain: ${chainLabel}`)
    console.log(`Steps executed: ${result.stepsExecuted}`)
    console.log('')

    for (const step of result.stepResults) {
        if (!step.success) {
            console.log(`FAIL  ${step.stepId} (${step.operation})`)
            if (step.error) {
                console.log(`      error: ${step.error}`)
            }
            for (const line of step.drift) {
                console.log(`      drift: ${line}`)
            }
        } else if (step.skippedComparison) {
            console.log(`PASS  ${step.stepId} (${step.operation}) — no golden output`)
        } else {
            console.log(`PASS  ${step.stepId} (${step.operation})`)
        }
    }

    console.log('')
    if (result.success) {
        console.log('Result: PASS — no step failures or output drift')
    } else {
        console.log(`Result: FAIL — ${result.stepsFailed} step failure(s), ${result.drifts.length} drift line(s)`)
        for (const line of result.drifts) {
            console.log(`  ${line}`)
        }
    }
    console.log('')
}
