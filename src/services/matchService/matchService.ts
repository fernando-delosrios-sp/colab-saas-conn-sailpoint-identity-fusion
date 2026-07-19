import { FusionAccount } from '../../model/account'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { ScoringService } from './scoringService'
import { MatchCandidateType } from './types'

export class MatchService {
    private readonly scoringService: ScoringService

    constructor(config: FusionConfig, log: LogService) {
        this.scoringService = new ScoringService(config, log)
    }

    async scoreFusionAccount(
        fusionAccount: FusionAccount,
        fusionIdentities: Iterable<FusionAccount>,
        candidateType?: MatchCandidateType,
        maxIdentityMatches?: number
    ): Promise<number> {
        return this.scoringService.scoreFusionAccount(
            fusionAccount,
            fusionIdentities,
            candidateType,
            maxIdentityMatches
        )
    }

    getCandidates(account: FusionAccount, excludeIds?: ReadonlySet<string>): Set<FusionAccount> | undefined {
        return this.scoringService.getCandidates(account, excludeIds)
    }

    buildTrigramIndex(identities: Iterable<FusionAccount>): void {
        this.scoringService.buildTrigramIndex(identities)
    }
}
