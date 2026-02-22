import { Entitlement, EntitlementSource } from './entitlement'

/** Raw data for constructing an action entitlement. */
export type ActionSource = EntitlementSource

/**
 * An action entitlement that can be assigned to a fusion account.
 * Actions trigger specific processing (e.g. report, fusion, correlate).
 */
export class Action extends Entitlement {
    constructor(object: ActionSource) {
        super('action', object)
    }
}
