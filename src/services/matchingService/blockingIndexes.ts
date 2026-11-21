import { missing } from '../../utils/safeRead'
import { yieldToEventLoop } from '../../utils/yieldToEventLoop'
import { lig3LengthUpperBound, normalizeLIG3 } from './scoringHelpers'

/** Compact identity id: index into FusionRun.blockingIdentityRoster. */
export type CompactIdentityId = number

/** Binary raw value to compact identity-id postings. */
export type ExactValueIndex = Map<string, CompactIdentityId[]>
/** LIG3-normalized length to compact identity-id postings. */
export type LengthBucketIndex = Map<number, CompactIdentityId[]>
/** Any roster entry exposing an attribute bag (MatchCandidateRecord or FusionAccount). */
type AttributeHolder = { attributes: Record<string, any> }

const INDEX_BUILD_YIELD_INTERVAL = 5_000

function pushExactValuePosting(index: ExactValueIndex, raw: unknown, id: CompactIdentityId): void {
    if (missing(raw)) return
    const key = String(raw)
    if (key === '') return
    const bucket = index.get(key)
    if (bucket) bucket.push(id)
    else index.set(key, [id])
}

/**
 * Build a Binary exact-value index: raw attribute string → compact identity ids.
 * Empty strings are omitted (Binary scores them 0).
 */
export function buildExactValueIndex(identities: readonly AttributeHolder[], attribute: string): ExactValueIndex {
    const index: ExactValueIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        pushExactValuePosting(index, identities[i].attributes[attribute], i)
    }
    return index
}

/**
 * Yielding variant of {@link buildExactValueIndex} for massive identity rosters.
 */
export async function buildExactValueIndexAsync(
    identities: readonly AttributeHolder[],
    attribute: string
): Promise<ExactValueIndex> {
    const index: ExactValueIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        pushExactValuePosting(index, identities[i].attributes[attribute], i)
        if ((i + 1) % INDEX_BUILD_YIELD_INTERVAL === 0) {
            await yieldToEventLoop()
        }
    }
    return index
}

/** Return compact ids whose Binary value exactly equals the account value. */
export function queryExactValueIndex(index: ExactValueIndex, accountValue: string): CompactIdentityId[] {
    if (accountValue === '') return []
    return index.get(accountValue) ?? []
}

function pushLig3LengthPosting(index: LengthBucketIndex, raw: unknown, id: CompactIdentityId): void {
    if (missing(raw)) return
    const len = normalizeLIG3(String(raw)).length
    const bucket = index.get(len)
    if (bucket) bucket.push(id)
    else index.set(len, [id])
}

/**
 * Build LIG3 length buckets keyed by LIG3-normalized string length.
 */
export function buildLig3LengthIndex(identities: readonly AttributeHolder[], attribute: string): LengthBucketIndex {
    const index: LengthBucketIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        pushLig3LengthPosting(index, identities[i].attributes[attribute], i)
    }
    return index
}

/**
 * Yielding variant of {@link buildLig3LengthIndex} for massive identity rosters.
 */
export async function buildLig3LengthIndexAsync(
    identities: readonly AttributeHolder[],
    attribute: string
): Promise<LengthBucketIndex> {
    const index: LengthBucketIndex = new Map()
    for (let i = 0; i < identities.length; i++) {
        pushLig3LengthPosting(index, identities[i].attributes[attribute], i)
        if ((i + 1) % INDEX_BUILD_YIELD_INTERVAL === 0) {
            await yieldToEventLoop()
        }
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

/** Resolve compact postings to their roster entries (Match Candidate Records or Fusion identities). */
export function compactIdsToIdentities<T extends AttributeHolder>(
    ids: Iterable<CompactIdentityId>,
    roster: readonly T[]
): Set<T> {
    const result = new Set<T>()
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
