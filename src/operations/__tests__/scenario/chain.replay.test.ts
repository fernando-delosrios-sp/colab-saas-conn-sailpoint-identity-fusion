import * as path from 'path'
import * as fs from 'os'
import * as fsSync from 'fs'
import { ScenarioRunner } from './framework/ScenarioRunner'
import { compareOutputs } from '../../scenarioReplay'
import { verifyScenarioRecording, registerScenarioStepFns } from './harness/scenarioRecordingVerify'
import { writePassingScenario } from './fixtures/minimalRecordingFixture'

describe('Identity Fusion NG - Scenario Replay Harness', () => {
    let tempDir: string
    let scenarioPath: string

    beforeAll(() => {
        registerScenarioStepFns()
        tempDir = fsSync.mkdtempSync(path.join(fs.tmpdir(), 'scenario-replay-fixture-'))
        scenarioPath = writePassingScenario(tempDir)
    })

    afterAll(() => {
        if (tempDir && fsSync.existsSync(tempDir)) {
            fsSync.rmSync(tempDir, { recursive: true, force: true })
        }
    })

    it('verifyScenarioRecording succeeds on minimal fixture', async () => {
        const result = await verifyScenarioRecording(scenarioPath)
        expect(result.stepResults[0]?.error).toBeUndefined()
        expect(result.stepsFailed).toBe(0)
        expect(result.drifts).toEqual([])
        expect(result.stepResults).toHaveLength(1)
        expect(result.stepResults[0].success).toBe(true)
    })

    it('compareOutputs detects output drift', () => {
        const actual = [{ attributes: { id: 'changed' } }]
        const expected = { attributes: { id: 'original' } }
        const { drift } = compareOutputs(actual, expected, 'step-1')
        expect(drift.length).toBeGreaterThan(0)
    })

    describe('Scenario structure validation', () => {
        it('validates scenario JSON structure from fixture', () => {
            const runner = new ScenarioRunner(scenarioPath)

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
            const runner = new ScenarioRunner(scenarioPath)
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
