import { SourceConfigLike } from '../harness/mockRegistry'

export type AggregationPassData = {
    identitiesFound: number
    managedAccounts: Array<{ id: string; sourceName: string }>
    decisions: string[]
    outputAccounts: Array<{ id: string }>
}

export type AggregationScenario = {
    name: string
    sourceConfigs: SourceConfigLike[]
    passData: {
        pass1: AggregationPassData
        pass2: AggregationPassData
    }
}

export type SmokeMatrixScenario = {
    name: string
    config: {
        includeIdentities?: boolean
        fusionAverageScore?: number
        fusionMergingIdentical?: boolean
        sources?: Array<{
            name: string
            sourceType?: 'authoritative' | 'record' | 'orphan'
            disableNonMatchingAccounts?: boolean
        }>
    }
    identities: Array<{ id: string; name: string; attributes?: Record<string, unknown> }>
    managedAccounts: Array<{ id: string; sourceName: string; attributes?: Record<string, unknown>; name?: string }>
    forms?: Array<Record<string, unknown>>
    expected: {
        correlatedCount: number
        matchesCount?: number
        disablePlannedCount?: number
    }
}
