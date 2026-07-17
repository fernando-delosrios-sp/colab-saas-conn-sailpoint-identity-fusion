import { SourceConfigLike } from '../harness/mockRegistry'

type AggregationPassData = {
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
