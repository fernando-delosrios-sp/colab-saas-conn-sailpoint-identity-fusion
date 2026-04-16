import { AggregationScenario } from './scenarioTypes'

export const aggregationScenarios: AggregationScenario[] = [
    {
        name: 'keeps pass1 pending decision and applies pass2 correlation output',
        sourceConfigs: [
            { name: 'HR', correlationMode: 'none', sourceType: 'authoritative' },
            { name: 'Payroll', correlationMode: 'none', sourceType: 'record' },
        ],
        passData: {
            pass1: {
                identitiesFound: 1,
                managedAccounts: [
                    { id: 'acct-1', sourceName: 'HR' },
                    { id: 'acct-2', sourceName: 'Payroll' },
                ],
                decisions: ['pending-review'],
                outputAccounts: [],
            },
            pass2: {
                identitiesFound: 1,
                managedAccounts: [{ id: 'acct-1', sourceName: 'HR' }],
                decisions: ['approved-correlate:id-1'],
                outputAccounts: [{ id: 'fusion-id-1' }],
            },
        },
    },
    {
        name: 're-evaluates pass2 with rejection and keeps unmatched output empty',
        sourceConfigs: [{ name: 'Contractor', correlationMode: 'none', sourceType: 'orphan' }],
        passData: {
            pass1: {
                identitiesFound: 2,
                managedAccounts: [{ id: 'acct-99', sourceName: 'Contractor' }],
                decisions: ['pending-review'],
                outputAccounts: [],
            },
            pass2: {
                identitiesFound: 2,
                managedAccounts: [{ id: 'acct-99', sourceName: 'Contractor' }],
                decisions: ['rejected-new-identity:false'],
                outputAccounts: [],
            },
        },
    },
]
