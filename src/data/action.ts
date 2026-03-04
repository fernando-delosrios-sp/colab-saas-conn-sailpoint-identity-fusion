import { EntitlementSource } from '../model/entitlement'

export const actions: EntitlementSource[] = [
    { id: 'report', name: 'Fusion report', description: 'Generate fusion report' },
    { id: 'fusion', name: 'Fusion account', description: 'Create a fusion account' },
    { id: 'correlated', name: 'Correlate accounts', description: 'Correlate missing source accounts' },
]
