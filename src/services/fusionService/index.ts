// Re-export main service class
export { FusionService } from './fusionService'
export { AggregationTracker } from './aggregationTracker'

// Re-export batching utilities
export {
    batchProcess,
    getManagedAccountsBatchSize,
    getManagedAccountEventLoopYieldEvery,
    getFusionParallelBatchSize,
    yieldToEventLoop,
    forEachBatched,
} from './batching'

// Re-export types
export type { FusionReport, FusionReportAccount, FusionReportMatch, FusionReportScore } from './types'
