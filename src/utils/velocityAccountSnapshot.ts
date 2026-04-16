/**
 * Velocity account snapshots (`$accounts[]`, `$sources`, `$account`) expose nested
 * `source` and `schema` objects. These helpers read the current shape and fall
 * back to legacy flat keys for backwards compatibility.
 */
export function velocitySnapshotSourceName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return String((nested as { name?: unknown }).name ?? '').trim()
    }
    return String(account._source ?? '').trim()
}

export function velocitySnapshotSourceId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return String((nested as { id?: unknown }).id ?? '').trim()
    }
    return String(account._sourceId ?? '').trim()
}

export function velocitySnapshotSchemaName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return String((nested as { name?: unknown }).name ?? '').trim()
    }
    return String(account._name ?? '').trim()
}

export function velocitySnapshotSchemaId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return String((nested as { id?: unknown }).id ?? '').trim()
    }
    return String(account._nativeIdentity ?? '').trim()
}
