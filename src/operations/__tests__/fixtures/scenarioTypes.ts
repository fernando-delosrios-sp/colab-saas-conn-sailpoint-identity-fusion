import { SourceConfigLike } from '../harness/mockRegistry'

type AggregationSweepData = {
    identitiesFound: number
    managedAccounts: Array<{ id: string; sourceName: string }>
    decisions: string[]
    outputAccounts: Array<{ id: string }>
}

export type AggregationScenario = {
    name: string
    sourceConfigs: SourceConfigLike[]
    sweepData: {
        sweep1: AggregationSweepData
        sweep2: AggregationSweepData
    }
}
