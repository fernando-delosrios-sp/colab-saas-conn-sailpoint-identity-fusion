import { FusionAccount } from '../../model/account'
import { missing } from '../../utils/safeRead'
import { lig3LengthUpperBound, normalizeLIG3 } from './scoringHelpers'

/** Compact identity id: index into FusionRun.blockingIdentityRoster. */
export type CompactIdentityId = number

/** Binary raw value to compact identity-id postings. */
export type ExactValueIndex = Map<string, CompactIdentityId[]>
/** LIG3-normalized length to compact identity-id postings. */
export type LengthBucketIndex = Map<number, CompactIdentityId[]>

/**
 * Build a Binary exact-value index: raw attribute string → compact identity ids.
 * Empty strings are omitted (Binary scores them 0).
 */
export function buildExactValueIndex(identities: FusionAccount[], attribute: string): ExactValueIndex {
    const index: ExactValueIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        const raw = identities[i].attributes[attribute]
        if (missing(raw)) continue
        const key = String(raw)
        if (key === '') continue
        const bucket = index.get(key)
        if (bucket) bucket.push(i)
        else index.set(key, [i])
    }
    return index
}

/** Return compact ids whose Binary value exactly equals the account value. */
export function queryExactValueIndex(index: ExactValueIndex, accountValue: string): CompactIdentityId[] {
    if (accountValue === '') return []
    return index.get(accountValue) ?? []
}

/**
 * Build LIG3 length buckets keyed by LIG3-normalized string length.
 */
export function buildLig3LengthIndex(identities: FusionAccount[], attribute: string): LengthBucketIndex {
    const index: LengthBucketIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        const raw = identities[i].attributes[attribute]
        if (missing(raw)) continue
        const len = normalizeLIG3(String(raw)).length
        const bucket = index.get(len)
        if (bucket) bucket.push(i)
        else index.set(len, [i])
    }
    return index
}

/**
 * Identities whose normalized length can still meet `fusionScore` under {@link lig3UpperBound}.
 */
export function queryLig3LengthIndex(
    index: LengthBucketIndex,
    accountValue: string,
    fusionScore: number
): CompactIdentityId[] {
    const accountLen = normalizeLIG3(accountValue).length
    const result: CompactIdentityId[] = []
    for (const [identityLen, ids] of index) {
        if (lig3LengthUpperBound(accountLen, identityLen) < fusionScore) continue
        for (const id of ids) result.push(id)
    }
    return result
}

/** Resolve compact postings to their Fusion identity objects. */
export function compactIdsToIdentities(ids: Iterable<CompactIdentityId>, roster: FusionAccount[]): Set<FusionAccount> {
    const result = new Set<FusionAccount>()
    for (const id of ids) {
        const identity = roster[id]
        if (identity) result.add(identity)
    }
    return result
}

/** Intersect a mutable compact-id set with one rule's postings. */
export function intersectCompactIds(
    current: Set<CompactIdentityId>,
    incoming: CompactIdentityId[]
): Set<CompactIdentityId> {
    const incomingSet = new Set(incoming)
    for (const id of current) {
        if (!incomingSet.has(id)) current.delete(id)
    }
    return current
}
