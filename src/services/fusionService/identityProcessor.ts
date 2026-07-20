import { IdentityDocument, AccountV2025 as Account } from 'sailpoint-api-client'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { FusionRun } from '../../model/fusionRun'
import { compact } from './collections'
import { batchProcess } from './collections'
import { assert } from '../../utils/assert'
import type { IdentityService } from '../identityService'
import type { SourceService } from '../sourceService'
import type { AggregationTracker } from './aggregationTracker'
import type { MappingService } from '../mappingService'
import type { DefinitionService } from '../definitionService'
import type { FusionReportBlend } from './types'
import { OperationContext } from './types'

export interface IdentityProcessorDeps {
    identities: IdentityService
    getTracker(): AggregationTracker | undefined
    sources: SourceService
    configSourceNames: Set<string>
    mappingService: MappingService
    definitionService: DefinitionService
    buildFusionBlend(fa: FusionAccount, account: Account): FusionReportBlend
}

export class IdentityProcessor {
    constructor(
        private config: FusionConfig,
        private log: LogService,
        private run: FusionRun,
        private deps: IdentityProcessorDeps,
        private commandType?: StandardCommand,
        private operationContext?: OperationContext
    ) {}

    private isAggregationAccountListMode(): boolean {
        return (
            this.commandType === StandardCommand.StdAccountList ||
            this.operationContext === OperationContext.AccountList
        )
    }

    private shouldPruneDeletedManagedAccounts(): boolean {
        return (
            this.isAggregationAccountListMode() ||
            this.commandType === StandardCommand.StdAccountRead ||
            this.commandType === StandardCommand.StdAccountUpdate ||
            this.commandType === StandardCommand.StdAccountEnable ||
            this.commandType === StandardCommand.StdAccountDisable
        )
    }

    private async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
        this.deps.mappingService.mapAttributes(fusionAccount, this.run)
        await this.deps.definitionService.refreshNormalAttributes(fusionAccount)
        this.deps.definitionService.refreshReverseCorrelationAttributes(fusionAccount)
    }

    private setFusionAccount(fusionAccount: FusionAccount): void {
        this.run.registerFusionAccount(fusionAccount, this.deps.getTracker())
    }

    /**
     * Process all identities.
     *
     * This is Phase 3 of the work queue depletion process:
     * - Phase 1: fetchFormData removes accounts with pending form decisions
     * - Phase 2: processFusionAccounts removes accounts belonging to existing fusion accounts
     * - Phase 3: processIdentities (this method) removes accounts belonging to identities
     * - Phase 4: processManagedAccounts processes only what remains (uncorrelated accounts)
     *
     * For identities that don't have a corresponding fusion account yet, this creates a
     * fusion account from the identity and attaches any managed accounts that belong to it.
     * Matched accounts are deleted from the work queue.
     *
     * @returns Fusion accounts for identities that did not already have one
     */
    public async processIdentities(): Promise<FusionAccount[]> {
        const { identities } = this.deps.identities
        const tracker = this.deps.getTracker()
        if (tracker) tracker.identitiesProcessedCount = identities.length
        this.log.info(
            `Processing identity documents: creating or merging fusion accounts for ${identities.length} ISC identity document(s)`
        )
        const results = await batchProcess(identities, 'Identity documents', (x) => this.processIdentity(x), this.config, this.log)
        this.log.info(
            `Identity documents phase finished: ${identities.length} identity document(s) processed (fusion accounts created or updated from identities)`
        )
        return compact(results)
    }

    /**
     * Process a single identity.
     *
     * Creates a fusion account from an identity document if one doesn't already exist.
     * This handles identities that don't have a pre-existing fusion account record.
     *
     * Before creating a new baseline account, checks whether an existing Fusion account
     * in fusionAccountMap or fusionIdentityMap already covers this identity's managed
     * accounts. This prevents a competing duplicate baseline account from being created
     * when an ISC identity is destroyed and recreated (e.g. after a display-attribute
     * change triggers identity recreation), which would otherwise cause the original
     * Fusion account to be orphaned and a new one to lose all generated unique attributes.
     *
     * Work Queue Integration:
     * Passes direct reference to the work queue so managed accounts belonging to this
     * identity can be matched and removed from the queue, preventing duplicate processing.
     *
     * @param identity - Identity document from the platform
     * @returns The fusion account produced, or undefined if identity was skipped or already had one
     */
    public async processIdentity(identity: IdentityDocument): Promise<FusionAccount | undefined> {
        const identityId = identity.id

        if (!this.run.hasFusionIdentity(identityId)) {
            const existingAccount = this.run.findFusionAccountForIdentity(
                identity,
                this.deps.configSourceNames
            )
            if (existingAccount) {
                this.log.debug(
                    `Reusing existing Fusion account ${existingAccount.managedKey} for identity ` +
                        `${identity.name} (${identityId}) - prevents duplicate baseline creation`
                )
                this.run.removeFusionAccount(existingAccount)
                existingAccount.addIdentityLayer(identity)
                existingAccount.setIdentityIdAttribute(identityId)
                existingAccount.setNeedsRefresh(true)
                this.run.registerFusionAccount(existingAccount)
                this.log.debug(
                    `Re-registered existing Fusion account under new identity: ${identity.name} (${identityId})`
                )
                return existingAccount
            }

            const fusionAccount = FusionAccount.fromIdentity(identity)
            this.log.debug(`Processing new identity: ${identity.name} (${identityId})`)
            fusionAccount.addIdentityLayer(identity)
            fusionAccount.setNeedsReset(true)
            fusionAccount.setOriginIdentityInScope(true)

            assert(this.run.managedAccountsById, 'Managed accounts have not been loaded')
            fusionAccount.addManagedAccountLayer(
                this.run,
                this.deps.sources.managedAccountsAllById,
                {
                    pruneDeleted: this.shouldPruneDeletedManagedAccounts(),
                    onBlend: (account) => this.run.recordFusionBlend(this.deps.buildFusionBlend(fusionAccount, account), this.deps.getTracker()),
                }
            )

            await this.applyAttributeProcessing(fusionAccount)

            this.setFusionAccount(fusionAccount)
            this.log.debug(`Registered identity as fusion account: ${identity.name} (${identityId})`)
            return fusionAccount
        }
        return undefined
    }
}
