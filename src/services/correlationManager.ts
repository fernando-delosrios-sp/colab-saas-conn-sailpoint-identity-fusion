import { FusionAccount } from '../model/account'
import { FusionDecision } from '../model/form'
import { FusionConfig } from '../model/config'
import { LogService } from './logService'
import { IdentityService } from './identityService'
import { SourceService } from './sourceService'

export class CorrelationManager {
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private sources: SourceService,
        private identities: IdentityService,
        private isAggregationMode: () => boolean
    ) {}

    /**
     * Apply per-source correlation logic for missing accounts on a fusion account.
     *
     * Groups missing accounts by source and applies the correlation strategy
     * configured for each source:
     * - `correlate`: Direct API correlation (PATCH /identityId)
     * - `reverse`: Set the dedicated Fusion attribute to the first missing account name
     * - `none`: Skip correlation
     *
     * `authorizedLinkDecision` (link-to-existing form outcome): when managed-account metadata is
     * missing for the assigned account id, `decision.account.sourceName` supplies the source for
     * the correlate check so aggregation still PATCHes when that source is `correlationMode: correlate`.
     * All other missing rows still follow `getManagedAccountInfo` + per-source mode only.
     */
    private async correlatePerSource(
        fusionAccount: FusionAccount,
        authorizedLinkDecision?: FusionDecision,
        forceDirectCorrelation: boolean = false
    ): Promise<void> {
        const missingIds = fusionAccount.missingAccountIds
        const canDirectCorrelate = Boolean(fusionAccount.identityId)

        const directCorrelateIds = canDirectCorrelate
            ? missingIds.filter((accountId) => {
                  const info = fusionAccount.getManagedAccountInfo(accountId)
                  if (!info) {
                      this.log.debug(
                          `Skipping per-source correlation for missing managed key "${accountId}" on ${fusionAccount.name}: source context not available`
                      )
                      return false
                  }
                  const sourceConfig = this.sources.getSourceConfig(info.source.name)
                  return (sourceConfig?.correlationMode ?? 'none') === 'correlate'
              })
            : []

        // Recovery path: if decision payload has source context but account metadata is missing
        // from the managed-account map, still include that assigned key for direct correlation.
        if (authorizedLinkDecision && !authorizedLinkDecision.newIdentity && canDirectCorrelate) {
            const assignedKey = authorizedLinkDecision.account.id
            const assignedSource = authorizedLinkDecision.account.sourceName
            if (
                assignedKey &&
                assignedSource &&
                missingIds.includes(assignedKey) &&
                !fusionAccount.getManagedAccountInfo(assignedKey) &&
                (this.sources.getSourceConfig(assignedSource)?.correlationMode ?? 'none') === 'correlate' &&
                !directCorrelateIds.includes(assignedKey)
            ) {
                directCorrelateIds.push(assignedKey)
            }
        }

        // Direct correlation
        if (directCorrelateIds.length > 0) {
            await this.identities.correlateAccounts(fusionAccount, directCorrelateIds)
        } else if (forceDirectCorrelation && canDirectCorrelate && missingIds.length > 0) {
            this.log.debug(
                `No per-source direct-correlation targets for ${fusionAccount.name}; forcing direct correlation for ${missingIds.length} missing account(s) due to explicit correlated action`
            )
            await this.identities.correlateAccounts(fusionAccount, [...missingIds])
        }
    }

    /**
     * Apply per-source correlation only during account-list aggregation when there are missing accounts.
     */
    public async applyPerSourceCorrelationIfNeeded(
        fusionAccount: FusionAccount,
        authorizedLinkDecision?: FusionDecision
    ): Promise<void> {
        if (!this.isAggregationMode()) return
        if (fusionAccount.missingAccountIdsSet.size === 0) return
        await this.correlatePerSource(fusionAccount, authorizedLinkDecision)
    }

    /**
     * Run per-source correlation for missing accounts (direct PATCH and/or reverse attributes).
     * Use when correlation must run outside account-list aggregation (e.g. correlate entitlement action).
     */
    public async correlateMissingAccountsPerSource(fusionAccount: FusionAccount): Promise<void> {
        if (fusionAccount.missingAccountIdsSet.size === 0) return
        await this.correlatePerSource(fusionAccount, undefined, true)
        fusionAccount.updateCorrelationStatus()
    }
}

