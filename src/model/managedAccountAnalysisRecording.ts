import { FusionAccount } from './account'
import { ManagedAccountAnalysisContext } from '../services/matchingService/types'

/** Port for recording managed-account match analysis into the aggregation tracker. */
export interface ManagedAccountAnalysisRecording {
    recordAnalysis(analysis: ManagedAccountAnalysisContext): void
    trackFailed(fusionAccount: FusionAccount, message: string): void
}
