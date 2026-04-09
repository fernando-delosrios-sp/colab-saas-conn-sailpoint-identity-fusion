import { Account } from 'sailpoint-api-client'

const MANAGED_ACCOUNT_KEY_SEPARATOR = '::'

type ManagedKeyAccountLike = {
    id?: string | null
    nativeIdentity?: string | null
    sourceId?: string | null
    sourceName?: string | null
    source?: {
        id?: string | null
        name?: string | null
    } | null
}

function normalizePart(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : undefined
}

function resolveSourceId(account: ManagedKeyAccountLike): string | undefined {
    return normalizePart(account.sourceId ?? account.source?.id)
}

function resolveNativeIdentity(account: ManagedKeyAccountLike): string | undefined {
    return normalizePart(account.nativeIdentity)
}

export function buildManagedAccountKey(account: ManagedKeyAccountLike): string | undefined {
    const sourceId = resolveSourceId(account)
    const nativeIdentity = resolveNativeIdentity(account)
    if (sourceId && nativeIdentity) {
        return `${sourceId}${MANAGED_ACCOUNT_KEY_SEPARATOR}${nativeIdentity}`
    }
    return normalizePart(account.id)
}

export function isCompositeManagedAccountKey(value: string | undefined | null): boolean {
    const normalized = normalizePart(value)
    if (!normalized) return false
    const separatorIndex = normalized.indexOf(MANAGED_ACCOUNT_KEY_SEPARATOR)
    return separatorIndex > 0 && separatorIndex < normalized.length - MANAGED_ACCOUNT_KEY_SEPARATOR.length
}

export function parseManagedAccountKey(
    value: string | undefined | null
): { sourceId: string; nativeIdentity: string } | undefined {
    const normalized = normalizePart(value)
    if (!normalized || !isCompositeManagedAccountKey(normalized)) return undefined
    const separatorIndex = normalized.indexOf(MANAGED_ACCOUNT_KEY_SEPARATOR)
    const sourceId = normalizePart(normalized.slice(0, separatorIndex))
    const nativeIdentity = normalizePart(normalized.slice(separatorIndex + MANAGED_ACCOUNT_KEY_SEPARATOR.length))
    if (!sourceId || !nativeIdentity) return undefined
    return { sourceId, nativeIdentity }
}

export function resolveManagedAccountKey(
    value: string | undefined | null,
    lookupByRawId?: (rawId: string) => string | undefined
): string | undefined {
    const normalized = normalizePart(value)
    if (!normalized) return undefined
    if (isCompositeManagedAccountKey(normalized)) return normalized
    return lookupByRawId?.(normalized) ?? normalized
}

export function getManagedAccountKeyFromAccount(
    account: Account,
    lookupByRawId?: (rawId: string) => string | undefined
): string | undefined {
    return (
        buildManagedAccountKey({
            id: account.id,
            sourceId: (account as any).sourceId,
            sourceName: account.sourceName,
            nativeIdentity: account.nativeIdentity,
        }) ?? resolveManagedAccountKey(account.id, lookupByRawId)
    )
}
