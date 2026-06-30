import { EntitlementSource } from '../model/entitlement'
import { StatusEntitlement } from '../model/statusEntitlement'

export const statuses: EntitlementSource[] = [
    {
        id: StatusEntitlement.Authorized,
        name: 'Authorized',
        description: 'A managed account was manually correlated by a reviewer',
    },
    { id: StatusEntitlement.Auto, name: 'Auto', description: 'Managed account assigned automatically after an exact attribute match' },
    { id: StatusEntitlement.Baseline, name: 'Baseline', description: 'Pre-existing identity' },
    { id: StatusEntitlement.Manual, name: 'Manual', description: 'A new base account was manually approved by a reviewer' },
    { id: StatusEntitlement.Orphan, name: 'Orphan', description: 'No managed accounts left' },
    { id: StatusEntitlement.NonMatched, name: 'Non-matched', description: 'No match found for base account' },
    { id: StatusEntitlement.Reviewer, name: 'Reviewer', description: 'An identity Match reviewer of any source' },
    { id: StatusEntitlement.Requested, name: 'Requested', description: 'Account was requested' },
    { id: StatusEntitlement.Uncorrelated, name: 'Uncorrelated', description: 'Account has sources accounts pending correlation' },
    { id: StatusEntitlement.ActiveReviews, name: 'Active reviews', description: 'Account has active fusion reviews' },
    { id: StatusEntitlement.Candidate, name: 'Candidate', description: 'This identity is part of a pending Fusion review' },
]
