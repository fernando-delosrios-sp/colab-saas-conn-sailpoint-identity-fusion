import { SourceInfo } from './types'

/**
 * Builds an ISC account filter string for a source, optionally appending
 * the source's configured accountFilter and any extra filter clauses.
 */
export function buildSourceFilter(sourceInfo: SourceInfo, ...extraFilters: string[]): string {
    const filterParts: string[] = [`sourceId eq "${sourceInfo.id}"`, ...extraFilters]
    if (sourceInfo.isManaged && sourceInfo.config?.accountFilter) {
        filterParts.push(`(${sourceInfo.config.accountFilter})`)
    }
    return filterParts.join(' and ')
}
