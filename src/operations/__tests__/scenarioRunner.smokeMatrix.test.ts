import { SmokeMatrixScenario } from './fixtures/scenarioTypes'

const { runPass } = require('../../../test-data/scenarios/scenarioRunner.js')

describe('scenarioRunner smoke matrix', () => {
    const baseManagedAccount = {
        id: 'acct-1',
        sourceName: 'Umbrella Corporation',
        attributes: {
            displayName: 'Carlos Oliveira',
            mail: 'carlos.oliveira@umbrellacorp.com',
        },
    }

    const baseIdentity = {
        id: 'id-1',
        name: 'Carlos Oliveira',
        attributes: {
            displayName: 'Carlos Oliveira',
            email: 'carlos.oliveira@umbrellacorp.com',
        },
    }

    const scenarios: SmokeMatrixScenario[] = [
        {
            name: 'includeIdentities false suppresses all candidate and correlation outputs',
            config: {
                includeIdentities: false,
                fusionAverageScore: 50,
                sources: [{ name: 'Umbrella Corporation', sourceType: 'authoritative' }],
            },
            identities: [baseIdentity],
            managedAccounts: [baseManagedAccount],
            expected: {
                correlatedCount: 0,
                potentialMatchesCount: 0,
                disablePlannedCount: 0,
            },
        },
        {
            name: 'average score threshold filters partial candidates',
            config: {
                includeIdentities: true,
                fusionAverageScore: 90,
                sources: [{ name: 'Umbrella Corporation', sourceType: 'authoritative' }],
            },
            identities: [
                {
                    id: 'id-1',
                    name: 'C. Oliveira',
                    attributes: { displayName: 'C. Oliveira', email: 'c.oliveira@umbrellacorp.com' },
                },
            ],
            managedAccounts: [
                {
                    id: 'acct-1',
                    sourceName: 'Umbrella Corporation',
                    attributes: {
                        displayName: 'Carlos Oliveira',
                        mail: 'carlos.oliveira@umbrellacorp.com',
                    },
                },
            ],
            expected: {
                correlatedCount: 0,
                potentialMatchesCount: 0,
                disablePlannedCount: 0,
            },
        },
        {
            name: 'orphan non-match with disable flag plans disable side effect',
            config: {
                includeIdentities: true,
                fusionAverageScore: 80,
                sources: [{ name: 'Legacy Orphans', sourceType: 'orphan', disableNonMatchingAccounts: true }],
            },
            identities: [],
            managedAccounts: [
                {
                    id: 'acct-orphan-1',
                    sourceName: 'Legacy Orphans',
                    attributes: { displayName: 'Unknown User', mail: 'unknown@legacy.example' },
                },
            ],
            expected: {
                correlatedCount: 0,
                potentialMatchesCount: 0,
                disablePlannedCount: 1,
            },
        },
    ]

    it.each(scenarios)('$name', (scenario) => {
        const result = runPass('pass1', scenario.config, scenario.identities, scenario.managedAccounts, [])

        expect(result.summary.correlatedCount).toBe(scenario.expected.correlatedCount)
        if (scenario.expected.potentialMatchesCount !== undefined) {
            expect(result.summary.potentialMatchesCount).toBe(scenario.expected.potentialMatchesCount)
        }
        if (scenario.expected.disablePlannedCount !== undefined) {
            expect(result.summary.disablePlannedCount).toBe(scenario.expected.disablePlannedCount)
        }
    })

    it('applies finished form decisions in pass2', () => {
        const result = runPass(
            'pass2',
            {
                includeIdentities: true,
                fusionAverageScore: 50,
                sources: [{ name: 'Umbrella Corporation', sourceType: 'authoritative' }],
            },
            [baseIdentity],
            [baseManagedAccount],
            [
                {
                    id: 'form-1',
                    state: 'SUBMITTED',
                    formInput: { account: 'acct-1' },
                    formData: { newIdentity: false, identities: ['id-1'], comments: 'approved' },
                },
            ]
        )

        expect(result.summary.correlatedCount).toBe(1)
        expect(result.decisionsApplied).toHaveLength(1)
        expect(result.correlatedAccounts[0].identityId).toBe('id-1')
    })
})
