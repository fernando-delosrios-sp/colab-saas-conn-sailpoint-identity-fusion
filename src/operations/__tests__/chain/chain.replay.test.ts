import * as path from 'path'
import * as fs from 'fs'
import { ChainRunner, registerStepFn } from './framework/ChainRunner'
import { StepDefinition } from './framework/ChainRunner'
import { ChainContext } from './framework/ChainContext'
import { buildReplayContext, collectOutputs, compareOutputs } from './harness/ReplayAdapter'
import { accountDiscoverSchema } from '../../../operations/accountDiscoverSchema'
import { entitlementList } from '../../../operations/entitlementList'
import { accountList } from '../../../operations/accountList'
import { accountCreate } from '../../../operations/accountCreate'
import { accountDisable } from '../../../operations/accountDisable'
import { accountEnable } from '../../../operations/accountEnable'
import { AggregationTracker as _AggregationTracker } from '../../../services/fusionService'
import { accountRead } from '../../../operations/accountRead'
import { accountUpdate } from '../../../operations/accountUpdate'
import { ServiceRegistry as _ServiceRegistry } from '../../../services/serviceRegistry'
import { MockRegistry } from './framework/ChainContext'

let mockActiveRegistry: any = null

jest.mock('../../../services/serviceRegistry', () => ({
    ServiceRegistry: {
        setCurrent: jest.fn((reg) => {
            mockActiveRegistry = reg
        }),
        getCurrent: jest.fn(() => {
            return mockActiveRegistry
        }),
        clear: jest.fn(() => {
            mockActiveRegistry = null
        }),
    },
}))

function availableRecordings(): string[] {
    const _dir = path.resolve('test-data', 'recordings')
    if (!fs.existsSync(_dir)) return []
    return fs
        .readdirSync(_dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(_dir, d.name, 'scenario.json')))
        .map((d) => path.join(_dir, d.name, 'scenario.json'))
}

function registerAllStepFns(): void {
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

        context.state.setPassIndex(step.pass ?? 1)

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
            pass: step.pass,
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

describe('Identity Fusion NG - Recorded Chain Replay', () => {
    const _matchScoringMs = availableRecordings()

    beforeAll(() => {
        registerAllStepFns()
    })

    if (_matchScoringMs.length === 0) {
        it.skip('no recordings available — run npm run record to create one', () => {
            // placeholder
        })
    } else {
        it.each(_matchScoringMs)('replays recording: %s', async (scenarioPath) => {
            const runner = new ChainRunner(scenarioPath)
            const scenario = (runner as any).scenario
            const mas = scenario.initialState.managedAccounts
            const found17 = mas.filter((m: any) => String(m.nativeIdentity) === "17")
            const found18 = mas.filter((m: any) => String(m.nativeIdentity) === "18")
            console.log("Brian (17) MA:", found17)
            console.log("Brian (18) MA:", found18)

            const results = await runner.executeAll()

            expect(results.success).toBe(true)
            expect(results.stepsFailed).toBe(0)

            const steps = runner.getSteps()
            for (let i = 0; i < results.stepResults.length; i++) {
                const stepResult = results.stepResults[i]
                expect(stepResult.success).toBe(true)
                const _output = stepResult.output as Record<string, unknown>
                const step = steps[i]
                if (step?.expectedOutput) {
                    const { match, drift } = compareOutputs(
                        (_output?.outputs as unknown[]) ?? [],
                        step.expectedOutput,
                        `${stepResult.stepId} (index ${i})`
                    )
                    expect(drift).toEqual([])
                }
            }
        })
    }

    describe('Scenario Structure Validation', () => {
        it('validates scenario JSON structure when recordings exist', () => {
            if (_matchScoringMs.length === 0) return

            const runner = new ChainRunner(_matchScoringMs[0])

            const config = runner.getConfig()
            expect(config).toBeDefined()
            expect(config.sources).toBeDefined()

            const steps = runner.getSteps()
            expect(steps.length).toBeGreaterThan(0)

            const refValues = runner.getReferenceValues()
            expect(refValues).toBeDefined()

            for (const step of steps) {
                expect(step.id).toMatch(/^step-\d+$/)
                expect(step.operation).toBeDefined()
            }
        })

        it('reference values have expected keys', () => {
            if (_matchScoringMs.length === 0) return

            const runner = new ChainRunner(_matchScoringMs[0])
            const refValues = runner.getReferenceValues()

            for (const [_stepId, refs] of Object.entries(refValues)) {
                expect(refs.outputCount).toBeDefined()
                expect(refs.durationMs).toBeDefined()
                expect(refs.managedAccountsCount).toBeDefined()
                expect(refs.fusionAccountsCount).toBeDefined()
                expect(refs.identitiesCount).toBeDefined()
            }
        })
    })
})
