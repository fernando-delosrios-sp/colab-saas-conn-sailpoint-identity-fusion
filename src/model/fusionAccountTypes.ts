import { Attributes } from '@sailpoint/connector-sdk'

/** Origin / construction kind for a {@link FusionAccount}. */
export enum FusionAccountKind {
    Fusion = 'fusion',
    Identity = 'identity',
    Managed = 'managed',
    Decision = 'decision',
}

/** Source + schema native id stored for reverse correlation on managed account keys. */
export type FusionManagedAccountInfo = {
    source: { name: string }
    schema: { id: string }
}

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
