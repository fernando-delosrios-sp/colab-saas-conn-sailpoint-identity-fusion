import { spawnSync } from 'child_process'
import * as path from 'path'
import {
    installPassingRecordingChain,
    removeRecordingChain,
    writePassingScenario,
    FIXTURE_BASEURL,
} from './fixtures/minimalRecordingFixture'
import { recordingChainDir } from '../../../data/recordingPaths'

const REPO_ROOT = path.resolve(__dirname, '../../../..')

function runTestRecordingScript(chainName: string): ReturnType<typeof spawnSync> {
    return spawnSync('node', ['scripts/test-recording.js', chainName], {
        cwd: REPO_ROOT,
        env: { ...process.env, BASEURL: FIXTURE_BASEURL },
        encoding: 'utf-8',
    })
}

describe('test-recording CLI script', () => {
    const passingChain = `vitest-pass-${Date.now()}`
    const driftChain = `vitest-drift-${Date.now()}`

    beforeAll(() => {
        installPassingRecordingChain(passingChain)
        const driftDir = recordingChainDir(driftChain, FIXTURE_BASEURL)
        writePassingScenario(driftDir, { chainName: driftChain, includeDriftGolden: true })
    })

    afterAll(() => {
        removeRecordingChain(passingChain)
        removeRecordingChain(driftChain)
    })

    it('exits 0 when verifying a passing recording', () => {
        const result = runTestRecordingScript(passingChain)
        expect(result.status).toBe(0)
    })

    it('exits non-zero when goldens do not match', () => {
        const result = runTestRecordingScript(driftChain)
        expect(result.status).not.toBe(0)
    })

    it('exits non-zero with clear error when scenario directory is missing', () => {
        const result = runTestRecordingScript('unknown-scenario-does-not-exist-xyz')
        expect(result.status).toBe(1)
        expect(result.stderr ?? '').toContain('ERROR: scenario directory not found')
        expect(result.stderr ?? '').toContain('Capture this scenario first')
    })
})

describe('record-scenario CLI script', () => {
    it('prints deprecation warning referencing External Settings before starting', () => {
        const result = spawnSync('node', ['scripts/record-scenario.js'], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                RECORD_SCENARIO_NAME: 'deprecation-test/fixture',
            },
            encoding: 'utf-8',
            timeout: 500,
            killSignal: 'SIGKILL',
        })

        const output = `${result.stderr ?? ''}${result.stdout ?? ''}`
        expect(output).toContain('DEPRECATED')
        expect(output).toContain('externalRecordingEnabled')
    })
})


