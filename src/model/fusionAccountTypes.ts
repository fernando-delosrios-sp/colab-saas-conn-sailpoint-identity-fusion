import { Attributes } from '@sailpoint/connector-sdk'

/**
 * Container for all attribute layers associated with a fusion account.
 * Tracks current and previous attribute values, identity attributes,
 * and per-source account attribute arrays for merge operations.
 */
export type FusionAttributeBag = {
    /** Attributes from the previous aggregation run (used for change detection) */
    previous: Attributes
    /** Current computed attributes (result of mapping + generation) */
    current: Attributes
    /** Attributes from the correlated ISC identity */
    identity: Attributes
    /** Flat list of attribute objects from all managed source accounts */
    accounts: Attributes[]
    /** Attribute objects grouped by source name (supports multi-account-per-source scenarios) */
    sources: Map<string, Attributes[]>
}
