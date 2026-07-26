import { createHash } from 'crypto'

export const WRITE_METHODS = new Set([
    'post',
    'put',
    'patch',
    'delete',
    'createFormDefinition',
    'createFormInstance',
    'updateFormInstance',
    'deleteFormDefinition',
    'createFormInstanceReviewer',
    'importSourceSchema',
    'exportSourceSchema',
    'updateSourceSchema',
    'createConfiguration',
    'updateConfiguration',
])

export function isWriteMethod(method: string): boolean {
    const lower = method.toLowerCase()
    return (
        WRITE_METHODS.has(method) ||
        lower.startsWith('create') ||
        lower.startsWith('update') ||
        lower.startsWith('delete') ||
        lower.startsWith('patch') ||
        lower.startsWith('post') ||
        lower.startsWith('put') ||
        lower.startsWith('import') ||
        lower.startsWith('export')
    )
}

export function stableApiCallKey(apiName: string, method: string, args: unknown[]): string {
    return `${apiName}.${method}:${JSON.stringify(args)}`
}

export function syntheticDryRunId(apiName: string, method: string, args: unknown[]): string {
    const digest = createHash('sha256').update(stableApiCallKey(apiName, method, args)).digest('hex').slice(0, 16)
    return `dryrun-${digest}`
}
