import type { Attributes } from '@sailpoint/connector-sdk'
import type { FusionAccountKind, IdentityInfo } from './fusionAccountTypes'

/** Fields factories set before collaborators are fully hydrated. */
export type FusionAccountFactorySeed = {
    type?: FusionAccountKind
    managedKey?: string
    iscAccountId?: string
    modified?: string
    identityInfo?: IdentityInfo
    name?: string
    sourceName?: string
    attributeBagCurrent?: Attributes
    attributeBagPrevious?: Attributes
}
