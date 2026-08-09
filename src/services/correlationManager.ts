import { FusionAccount } from '../model/account'
import { FusionAccountKind } from '../model/fusionAccountTypes'
import { FusionDecision } from '../model/form'
import { FusionConfig } from '../model/config'
import { normalizeCompositeManagedAccountKey } from '../model/managedAccountKey'
import { trimStr } from '../utils/safeRead'
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

    private hasAnyCorrelateSource(): boolean {
        return this.config.sources.some((sc) => sc.correlationMode === 'correlate')
    }

    /**
     * Correlation-on-aggregation (link) applies only to established Fusion identities —
     * persisted fusion rows and identity-origin baselines — not provisional managed-origin
     * non-match accounts created during the current run.
     */
    private isLinkCorrelationEligible(fusionAccount: FusionAccount): boolean {
        if (fusionAccount.isManaged || fusionAccount.type === FusionAccountKind.Decision) {
            return false
        }
        return fusionAccount.fromIdentity || fusionAccount.type === FusionAccountKind.Fusion
    }

    /**
     * Apply per-source correlation logic for missing accounts on a fusion account.
     *
     * Groups missing accounts by source and applies the correlation strategy
     * configured for each source:
     * - `correlate`: Direct API correlation (PATCH /identityId)
     * - `reverse`: Set the dedicated Fusion attribute to the first missing account name
     * - `none`: Skip correlation
     *
     * `mergeDecision` (link-to-existing form outcome): when managed-account metadata is
     * missing for the assigned account id, `decision.account.sourceName` supplies the source for
     * the correlate check so aggregation still PATCHes when that source is `correlationMode: correlate`.
     * All other missing rows still follow `collections.managedAccountInfo` + per-source mode only.
     */
    private async correlatePerSource(
        fusionAccount: FusionAccount,
        mergeDecision?: FusionDecision,
        forceDirectCorrelation: boolean = false,
        kind: 'link' | 'merge' = 'link'
    ): Promise<void> {
        const missingIds = fusionAccount.missingAccountIds
        const canDirectCorrelate = Boolean(fusionAccount.identityId)

        for (const accountId of missingIds) {
            if (!canDirectCorrelate) {
                this.log.recordCorrelationSkipped('noIdentity')
                continue
            }
            const info = fusionAccount.collections.managedAccountInfo.get(accountId)
            if (!info) {
                this.log.recordCorrelationSkipped('noSourceContext')
                continue
            }
            const sourceConfig = this.sources.getSourceConfig(info.source.name)
            if ((sourceConfig?.correlationMode ?? 'none') !== 'correlate') {
                this.log.recordCorrelationSkipped('wrongMode')
            }
        }

        const directCorrelateIds = canDirectCorrelate
            ? missingIds.filter((accountId) => {
                  const info = fusionAccount.collections.managedAccountInfo.get(accountId)
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

        // Link-to-existing form outcomes: PATCH correlate-mode sources for the assigned
        // managed account even when assembleAccount already blended it off missing-accounts.
        if (mergeDecision && !mergeDecision.newIdentity && canDirectCorrelate) {
            const rawKey = trimStr(mergeDecision.account.id) ?? ''
            const assignedKey = normalizeCompositeManagedAccountKey(rawKey)
            const assignedSource = mergeDecision.account.sourceName
            if (
                assignedKey &&
                assignedSource &&
                (this.sources.getSourceConfig(assignedSource)?.correlationMode ?? 'none') === 'correlate' &&
                !directCorrelateIds.includes(assignedKey)
            ) {
                directCorrelateIds.push(assignedKey)
            }
        }

        // Direct correlation
        if (directCorrelateIds.length > 0) {
            await this.identities.correlateAccounts(fusionAccount, directCorrelateIds, kind)
        } else if (forceDirectCorrelation && canDirectCorrelate && missingIds.length > 0) {
            this.log.debug(
                `No per-source direct-correlation targets for ${fusionAccount.name}; forcing direct correlation for ${missingIds.length} missing account(s) due to explicit correlated action`
            )
            await this.identities.correlateAccounts(fusionAccount, [...missingIds], kind)
        }
    }

    /**
     * Apply per-source correlation only during account-list aggregation when there are missing accounts.
     */
    public async applyPerSourceCorrelationIfNeeded(
        fusionAccount: FusionAccount,
        mergeDecision?: FusionDecision,
        kind: 'link' | 'merge' = 'link'
    ): Promise<void> {
        if (!this.isAggregationMode()) return
        if (kind === 'link') {
            if (!this.hasAnyCorrelateSource()) return
            if (!this.isLinkCorrelationEligible(fusionAccount)) return
        }
        const hasMissing = fusionAccount.missingAccountIdsSet.size > 0
        const hasAuthorizedMerge =
            mergeDecision != null &&
            !mergeDecision.newIdentity &&
            Boolean(trimStr(mergeDecision.account.id))
        if (!hasMissing && !hasAuthorizedMerge) return
        await this.correlatePerSource(fusionAccount, mergeDecision, false, kind)
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




