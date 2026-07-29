import { spawnSync } from 'child_process'
import * as path from 'path'
import {
    installPassingRecordingChain,
    removeRecordingChain,
    writePassingScenario,
} from './fixtures/minimalRecordingFixture'
import { recordingChainDir } from '../../../data/recordingPaths'

const REPO_ROOT = path.resolve(__dirname, '../../../..')

function runTestRecordingScript(chainName: string): ReturnType<typeof spawnSync> {
    return spawnSync('node', ['scripts/test-recording.js', chainName], {
        cwd: REPO_ROOT,
        env: { ...process.env },
        encoding: 'utf-8',
    })
}

describe('test-recording CLI script', () => {
    const passingChain = `vitest-pass-${Date.now()}`
    const driftChain = `vitest-drift-${Date.now()}`

    beforeAll(() => {
        installPassingRecordingChain(passingChain)
        const driftDir = recordingChainDir(driftChain)
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

    it('exits non-zero with clear error when chain directory is missing', () => {
        const result = runTestRecordingScript('unknown-chain-does-not-exist-xyz')
        expect(result.status).toBe(1)
        expect(result.stderr ?? '').toContain('ERROR: chain directory not found')
        expect(result.stderr ?? '').toContain('Record this chain first')
    })
})
