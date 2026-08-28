import * as fs from 'fs'
import * as path from 'path'
import { FusionAttribute } from '../../data/schema'
import { ScenarioRunner } from './scenario/framework/ScenarioRunner'
import { registerScenarioStepFns } from './scenario/harness/scenarioRecordingVerify'

const scenarioPath = path.resolve(process.cwd(), 'recordings/cambridge-sb/accountread/scenario.json')
const staleStudentUrl = 'https://api.apps.cam.ac.uk/university-student/v1alpha2/students/sailpoint-307803971'

describe.skipIf(!fs.existsSync(scenarioPath))('cambridge-sb accountRead vanished snapshot keys', () => {
    let attributes: Record<string, unknown>
    let expectedOutput: Record<string, unknown>

    beforeAll(async () => {
        registerScenarioStepFns()
        const runner = new ScenarioRunner(scenarioPath)
        const steps = runner.getSteps()
        expectedOutput = (steps[0]?.expectedOutput ?? {}) as Record<string, unknown>
        const result = await runner.executeAll()
        expect(result.success).toBe(true)
        const output = result.stepResults[0]?.output as { outputs?: unknown[] } | undefined
        const sent = output?.outputs?.[0] as { attributes?: Record<string, unknown> } | undefined
        attributes = sent?.attributes ?? {}
    })

    it('STUDENT_ID and STUDENT_FLAG are absent from the accountRead output', () => {
        expect(attributes.STUDENT_ID).toBeUndefined()
        expect(attributes.STUDENT_FLAG).toBeUndefined()
    })

    it('STUDENT_URL and IN_STUDENT_SYSTEM recompute from the cleared inputs', () => {
        expect(attributes.STUDENT_URL).not.toBe(staleStudentUrl)
        expect(attributes.IN_STUDENT_SYSTEM).not.toBe('true')
    })

    it('id, name, and Fusion control attributes are unchanged', () => {
        const expectedAttributes = (expectedOutput.attributes ?? {}) as Record<string, unknown>
        expect(attributes.id).toBe(expectedAttributes.id)
        expect(attributes.name).toBe(expectedAttributes.name)
        for (const key of Object.values(FusionAttribute)) {
            expect(attributes[key]).toEqual(expectedAttributes[key])
        }
    })
})
