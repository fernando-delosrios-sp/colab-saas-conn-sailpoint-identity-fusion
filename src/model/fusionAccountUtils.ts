import { Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionDecision } from './form'
import type { IdentityInfo } from './fusionAccountTypes'
import { normalizeCompositeManagedAccountKey } from './managedAccountKey'
import { readString, trimStr } from '../utils/safeRead'

/** Identity-side display label: identity.attributes.displayName || identity.name. */
export function identityDisplayNameFromIdentity(identity: IdentityDocument): string | undefined {
    const fromAttrs = (identity.attributes as Record<string, unknown> | undefined)?.displayName as
        | string
        | undefined
    return trimStr(fromAttrs) ?? trimStr(identity.name) ?? undefined
}

/** Account-side display label: account.identity?.name || account.name. */
export function identityDisplayNameFromAccount(account: Account): string | undefined {
    const identityRefName = (account as { identity?: { name?: string } }).identity?.name
    return trimStr(identityRefName) ?? trimStr(account.name) ?? undefined
}

/**
 * Builds a unified IdentityInfo runtime object from an IdentityDocument or standard parameter bag.
 *
 * Rules:
 * - `id` is mandatory and non-empty. Without it, no IdentityInfo is returned.
 * - `name` is the alias/login chain: identity.name || account.identity?.name || decision.identityName.
 * - `displayName` is the human-readable chain:
 *   identity.attributes.displayName || identity.name || account.identity?.name || account.name.
 */
export function buildIdentityInfo(
    source: IdentityDocument | Account | FusionDecision | { id?: string | null; name?: string | null; displayName?: string | null }
): IdentityInfo | undefined {
    let id: string | undefined
    let name: string | undefined
    let displayName: string | undefined

    // FusionDecision
    if ('account' in source && ('identityName' in source || 'identityId' in source)) {
        const decision = source as FusionDecision
        id = trimStr(decision.identityId)
        name = trimStr(decision.identityName)
        displayName = name ?? trimStr(decision.account.name) ?? trimStr(decision.account.id)
    }
    // Account
    else if ('sourceId' in source || 'nativeIdentity' in source || 'accountId' in source || 'identityId' in source || 'identity' in source) {
        const account = source as Account
        id = trimStr(account.identityId)
        name = trimStr((account as { identity?: { name?: string } }).identity?.name)
        displayName = identityDisplayNameFromAccount(account)
    }
    // IdentityDocument
    else if ('attributes' in source && source.attributes) {
        const identity = source as IdentityDocument
        id = trimStr(identity.id)
        name = trimStr(identity.name)
        displayName = identityDisplayNameFromIdentity(identity)
    }
    // Fallback standard bag
    else {
        id = trimStr((source as any).id)
        name = trimStr((source as any).name)
        displayName = trimStr((source as any).displayName) ?? name
    }

    // id is mandatory for an identity linkage
    if (!id) {
        return undefined
    }

    return {
        id,
        name: name ?? '',
        displayName: displayName ?? name ?? '',
    }
}

/**
 * Resolve composite managed account key candidates from persisted fusion-account attributes.
 * Keeps legacy nativeIdentity as fallback when no composite can be recovered.
 */
export function resolveCompositeManagedKeyFromFusionRecord(account: Account): string | undefined {
    const attributes = (account.attributes ?? {}) as Record<string, unknown>
    const candidates = [
        readString(attributes, 'originAccount'),
        readString(attributes, 'mainAccount'),
        attributes.accounts,
        attributes['missing-accounts'],
    ].flat()

    for (const candidate of candidates) {
        if (candidate == null) continue
        const normalized = normalizeCompositeManagedAccountKey(String(candidate))
        if (normalized) return normalized
    }
    return undefined
}
