import { Entitlement, EntitlementSource } from './entitlement'

/** Raw data for constructing a status entitlement. */
export type StatusSource = EntitlementSource

/**
 * A status entitlement representing a fusion account's processing state.
 * Statuses include: uncorrelated, baseline, unmatched, manual, authorized, etc.
 */
export class Status extends Entitlement {
    constructor(object: StatusSource) {
        super('status', object)
    }
}
