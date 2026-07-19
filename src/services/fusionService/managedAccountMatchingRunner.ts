import { AccountV2025 as Account } from 'sailpoint-api-client'
import { PhaseTimer } from '../logService'
import type { FusionConfig } from '../../model/config'
import type { LogService } from '../logService'
import type { ManagedAccountAnalyzer, ManagedAccountAnalysisContext } from './managedAccountAnalyzer'
import type { CandidateRegistry } from './candidateRegistry'
import { yieldToEventLoop } from './batching'
import { hasDeferredCandidateMatches as checkHasDeferredCandidateMatches } from './helpers'

export interface ManagedAccountMatchingRunnerState {
    readonly config: FusionConfig
    readonly log: LogService
    readonly managedAccountAnalyzer: ManagedAccountAnalyzer
    readonly candidateRegistry: CandidateRegistry
    processAccount(account: Account): Promise<any>
}

type ManagedAccountMatchingResolution = 'identity-match' | 'deferred-match' | 'non-match'

export interface ManagedAccountMatchingResult {
    analysis: ManagedAccountAnalysisContext
    resolution: ManagedAccountMatchingResolution
}

interface PendingDeferred {
    analysis: ManagedAccountAnalysisContext
    account: Account
}

export class ManagedAccountMatchingRunner {
    constructor(private readonly state: ManagedAccountMatchingRunnerState) {}

    async execute(
        accounts: Account[],
        batchSize: number,
        managedAccountProcessingStartedAt: number
    ): Promise<ManagedAccountMatchingResult[]> {
        const initialQueueSize = accounts.length
        let processedCount = 0
        const results: ManagedAccountMatchingResult[] = []

        const logProgressEvery = Math.max(
            1,
            Math.min(batchSize, initialQueueSize)
        )

        const logProgress = (): void => {
            if (
                processedCount === 1 ||
                processedCount % logProgressEvery === 0 ||
                processedCount === initialQueueSize
            ) {
                this.state.log.info(
                    `Managed accounts progress: ${processedCount}/${initialQueueSize} analyzed | OPERATION ELAPSED ${PhaseTimer.formatElapsed(
                        Date.now() - managedAccountProcessingStartedAt
                    )}`
                )
            }
        }

        const hasDeferredMatching = (account: Account): boolean => {
            return this.state.managedAccountAnalyzer.isDeferredMatchingEnabledForSource(
                account.sourceName ?? undefined
            )
        }

        const pendingDeferred: PendingDeferred[] = []

        for (let i = 0; i < accounts.length; i += batchSize) {
            const batch = accounts.slice(i, i + batchSize)
            const identityResults = await Promise.all(
                batch.map((account) =>
                    this.state.managedAccountAnalyzer.scoreIdentityCandidates(account)
                )
            )

            for (let j = 0; j < identityResults.length; j++) {
                const analysis = identityResults[j]
                const account = batch[j]
                processedCount++
                logProgress()

                if (analysis.hasIdentityCandidateMatches) {
                    results.push({ analysis, resolution: 'identity-match' })
                } else if (hasDeferredMatching(account)) {
                    this.state.candidateRegistry.register(analysis.fusionAccount)
                    pendingDeferred.push({ analysis, account })
                } else {
                    results.push({ analysis, resolution: 'non-match' })
                }
            }
            await yieldToEventLoop()
        }

        for (let i = 0; i < pendingDeferred.length; i += batchSize) {
            const batch = pendingDeferred.slice(i, i + batchSize)
            await Promise.all(
                batch.map(async (pending) => {
                    await this.state.managedAccountAnalyzer.scoreDeferredCandidates(pending.analysis)
                    if (checkHasDeferredCandidateMatches(pending.analysis.fusionAccount)) {
                        results.push({ analysis: pending.analysis, resolution: 'deferred-match' })
                    } else {
                        results.push({ analysis: pending.analysis, resolution: 'non-match' })
                    }
                })
            )
            await yieldToEventLoop()
        }

        return results
    }
}
