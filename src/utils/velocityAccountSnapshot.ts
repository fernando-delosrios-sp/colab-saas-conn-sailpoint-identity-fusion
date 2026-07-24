import { trimStr } from './safeRead'

/**
 * Velocity account snapshots (`$accounts[]`, `$sources`, `$account`) expose nested
/op * `source` and `schema` objects. These helpers read only the current canonical shape.
 */
export function velocitySnapshotSourceName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return trimStr((nested as { name?: unknown }).name) ?? ''
    }
    return ''
}

export function velocitySnapshotSourceId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.source
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return trimStr((nested as { id?: unknown }).id) ?? ''
    }
    return ''
}

export function velocitySnapshotSchemaName(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'name' in nested) {
        return trimStr((nested as { name?: unknown }).name) ?? ''
    }
    return ''
}

export function velocitySnapshotSchemaId(account: Record<string, any> | undefined | null): string {
    if (!account) return ''
    const nested = account.schema
    if (nested && typeof nested === 'object' && nested !== null && 'id' in nested) {
        return trimStr((nested as { id?: unknown }).id) ?? ''
    }
    return ''
}
