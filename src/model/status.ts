import { Entitlement, EntitlementSource } from './entitlement'



/**
 * A status entitlement representing a fusion account's processing state.
 * Statuses include: uncorrelated, baseline, unmatched, manual, authorized, etc.
 */
export class Status extends Entitlement {
    constructor(object: EntitlementSource) {
        super('status', object)
    }
}
