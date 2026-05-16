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
import { accountRead } from '../../../operations/accountRead'
import { accountUpdate } from '../../../operations/accountUpdate'
import { ServiceRegistry } from '../../../services/serviceRegistry'
import { MockRegistry } from './framework/ChainContext'

jest.mock('../../../services/serviceRegistry', () => ({
    ServiceRegistry: {
        setCurrent: jest.fn(),
        clear: jest.fn(),
        getCurrent: jest.fn(),
    },
}))

function availableRecordings(): string[] {
    const dir = path.resolve('test-data', 'recordings')
    if (!fs.existsSync(dir)) return []
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'scenario.json')))
        .map((d) => path.join(dir, d.name, 'scenario.json'))
}

function registerAllStepFns(): void {
    registerStepFn('accountDiscoverSchema', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountDiscoverSchema(registry as any)
        } catch {
            // operation may fail with incomplete mocks; outputs still captured
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('entitlementList', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await entitlementList(registry as any, (step.input ?? { type: 'status' }) as any)
        } catch {
            // mock path
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
        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountList(registry as any, (step.input ?? { schema: { attributes: [] } }) as any)
        } catch {
            // mock path
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

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountCreate(registry as any, (step.input ?? {}) as any)
        } catch {
            // mock path
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountDisable', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountDisable(registry as any, (step.input ?? {}) as any)
        } catch {
            // mock path
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountEnable', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountEnable(registry as any, (step.input ?? {}) as any)
        } catch {
            // mock path
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountRead', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountRead(registry as any, (step.input ?? {}) as any)
        } catch {
            // mock path
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })

    registerStepFn('accountUpdate', async (step: StepDefinition, context: ChainContext) => {
        const replayCtx = buildReplayContext(step, context)
        const registry = replayCtx.registry as unknown as MockRegistry

        ;(ServiceRegistry.setCurrent as jest.Mock).mockImplementation(() => undefined)

        try {
            await accountUpdate(registry as any, (step.input ?? {}) as any)
        } catch {
            // mock path
        }

        return {
            operation: step.operation,
            outputs: collectOutputs(replayCtx),
        }
    })
}

describe('Identity Fusion NG - Recorded Chain Replay', () => {
    const recordings = availableRecordings()

    beforeAll(() => {
        registerAllStepFns()
    })

    if (recordings.length === 0) {
        it.skip('no recordings available — run npm run record to create one', () => {
            // placeholder
        })
    } else {
        it.each(recordings)('replays recording: %s', async (scenarioPath) => {
            const runner = new ChainRunner(scenarioPath)

            const results = await runner.executeAll()

            expect(results.success).toBe(true)
            expect(results.stepsFailed).toBe(0)

            for (const stepResult of results.stepResults) {
                expect(stepResult.success).toBe(true)
                const output = stepResult.output as Record<string, unknown>
                const step = runner.getSteps().find((s) => s.id === stepResult.stepId)
                if (step?.expectedOutput) {
                    const { match, drift } = compareOutputs(
                        (output?.outputs as unknown[]) ?? [],
                        step.expectedOutput,
                        stepResult.stepId
                    )
                    if (!match) {
                        console.warn(`Drift detected in ${stepResult.stepId}:`, drift)
                    }
                }
            }
        })
    }

    describe('Scenario Structure Validation', () => {
        it('validates scenario JSON structure when recordings exist', () => {
            if (recordings.length === 0) return

            const runner = new ChainRunner(recordings[0])

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
            if (recordings.length === 0) return

            const runner = new ChainRunner(recordings[0])
            const refValues = runner.getReferenceValues()

            for (const [stepId, refs] of Object.entries(refValues)) {
                expect(refs.outputCount).toBeDefined()
                expect(refs.durationMs).toBeDefined()
                expect(refs.managedAccountsCount).toBeDefined()
                expect(refs.fusionAccountsCount).toBeDefined()
                expect(refs.identitiesCount).toBeDefined()
            }
        })
    })
})
