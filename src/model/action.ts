import { Entitlement, EntitlementSource } from './entitlement'



/**
 * An action entitlement that can be assigned to a fusion account.
 * Actions trigger specific processing (e.g. report, fusion, correlate).
 */
export class Action extends Entitlement {
    constructor(object: EntitlementSource) {
        super('action', object)
    }
}
