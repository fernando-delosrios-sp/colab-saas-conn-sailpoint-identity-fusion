import { trimStr } from './safeRead'

/**
 * Velocity account snapshots (`$accounts[]`, `$sources`, `$account`) expose nested
 * `source` and `schema` objects. These helpers read the current shape and fall
 * back to legacy flat keys for backwards compatibility.
 */
export function velocitySnapshotSourceName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return trimStr((nested as { name?: unknown }).name) ?? ''
    }
    return trimStr(account._source) ?? ''
}

export function velocitySnapshotSourceId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return trimStr((nested as { id?: unknown }).id) ?? ''
    }
    return trimStr(account._sourceId) ?? ''
}

export function velocitySnapshotSchemaName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return trimStr((nested as { name?: unknown }).name) ?? ''
    }
    return trimStr(account._name) ?? ''
}

export function velocitySnapshotSchemaId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return trimStr((nested as { id?: unknown }).id) ?? ''
    }
    return trimStr(account._managedKey) ?? ''
}
