import { EntitlementSource } from '../model/entitlement'

export const statuses: EntitlementSource[] = [
    {
        id: 'authorized',
        name: 'Authorized',
        description: 'A managed account was manually correlated by a reviewer',
    },
    { id: 'auto', name: 'Auto', description: 'Managed account assigned automatically after an exact attribute match' },
    { id: 'baseline', name: 'Baseline', description: 'Pre-existing identity' },
    { id: 'manual', name: 'Manual', description: 'A new base account was manually approved by a reviewer' },
    { id: 'orphan', name: 'Orphan', description: 'No managed accounts left' },
    { id: 'nonMatched', name: 'NonMatched', description: 'No match found for base account' },
    { id: 'reviewer', name: 'Reviewer', description: 'An identity Match reviewer of any source' },
    { id: 'requested', name: 'Requested', description: 'Account was requested' },
    { id: 'uncorrelated', name: 'Uncorrelated', description: 'Account has sources accounts pending correlation' },
    { id: 'activeReviews', name: 'Active reviews', description: 'Account has active fusion reviews' },
    { id: 'candidate', name: 'Candidate', description: 'This identity is part of a pending Fusion review' },
]
