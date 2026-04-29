import type { FusionConfig } from '../../model/config'

/**
 * Writable in-progress config while applying section processors.
 * `FusionConfig` marks some internal fields `readonly` and omits runtime-only `getScore` / template `trim`.
 */
export type FusionConfigBuild = Omit<FusionConfig, 'fusionScoreMap' | 'pageSize'> & {
    fusionScoreMap?: Map<string, number>
    pageSize?: number
    trim?: boolean
    getScore?: (attribute?: string) => number
}
