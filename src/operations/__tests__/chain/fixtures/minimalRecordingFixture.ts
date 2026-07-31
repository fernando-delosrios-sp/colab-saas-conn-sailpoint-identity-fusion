import * as fs from 'fs'
import * as path from 'path'
import { recordingChainDir } from '../../../../data/recordingPaths'

/** Default baseurl for harness fixtures — yields tenant slug `example`. */
export const FIXTURE_BASEURL = 'https://example.identitynow.com'

export interface MinimalScenarioOptions {
    chainName?: string
    includeDriftGolden?: boolean
}

/** Writes a minimal passing scenario (entitlementList status) into dir/scenario.json. */
export function writePassingScenario(dir: string, options: MinimalScenarioOptions = {}): string {
    const chainName = options.chainName ?? 'harness-fixture'
    const scenario = {
        version: '1.0.0',
        chainName,
        config: { sources: [] },
        initialState: {
            identities: [],
            managedAccounts: {},
            fusionAccounts: [],
            fusionIdentityDecisions: [],
        },
        steps: [
            {
                id: 'step-1',
                operation: 'entitlementList',
                input: { type: 'status' },
                ...(options.includeDriftGolden
                    ? { expectedOutput: { attributes: { id: '__will-not-match__' } } }
                    : {}),
            },
        ],
        referenceValues: {
            'step-1': {
                outputCount: 0,
                durationMs: 0,
                managedAccountsCount: 0,
                fusionAccountsCount: 0,
                identitiesCount: 0,
            },
        },
    }
    const scenarioPath = path.join(dir, 'scenario.json')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + '\n')
    return scenarioPath
}

/** Creates a chain under recordings/<tenant>/{chainName}/ with a passing scenario. */
export function installPassingRecordingChain(chainName: string, baseurl = FIXTURE_BASEURL): string {
    const dir = recordingChainDir(chainName, baseurl)
    writePassingScenario(dir, { chainName })
    return dir
}

/** Removes a chain directory under recordings/<tenant>/ if present. */
export function removeRecordingChain(chainName: string, baseurl = FIXTURE_BASEURL): void {
    const dir = recordingChainDir(chainName, baseurl)
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

