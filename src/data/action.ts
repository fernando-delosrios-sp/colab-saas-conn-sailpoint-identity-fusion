import { EntitlementSource } from '../model/entitlement'
import { FusionAction } from '../model/fusionAction'

export const actions: EntitlementSource[] = [
    { id: 'report', name: 'Fusion report', description: 'Generate fusion report' },
    { id: 'fusion', name: 'Fusion account', description: 'Create a fusion account' },
    { id: FusionAction.Correlated, name: 'Correlated', description: 'Correlate missing source accounts' },
]
