import { trimStr } from './safeRead'

/**
 * Velocity account snapshots (`$accounts[]`, `$sources`, `$account`) expose nested
 * `source` and `schema` objects.
 */
function readVelocitySnapshotValue(
    account: Record<string, any> | undefined | null,
    key: string,
    field: 'name' | 'id'
): string {
    if (!account) return ''
    const nested = account[key]
    if (nested && typeof nested === 'object' && nested !== null && field in nested) {
        return trimStr((nested as { [k: string]: unknown })[field]) ?? ''
    }
    return ''
}

export function velocitySnapshotSourceName(account: Record<string, any> | undefined | null): string {
    return readVelocitySnapshotValue(account, 'source', 'name')
}

export function velocitySnapshotSourceId(account: Record<string, any> | undefined | null): string {
    return readVelocitySnapshotValue(account, 'source', 'id')
}

export function velocitySnapshotSchemaName(account: Record<string, any> | undefined | null): string {
    return readVelocitySnapshotValue(account, 'schema', 'name')
}

export function velocitySnapshotSchemaId(account: Record<string, any> | undefined | null): string {
    return readVelocitySnapshotValue(account, 'schema', 'id')
}
