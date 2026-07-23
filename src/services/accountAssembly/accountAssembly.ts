import { AccountV2025 as Account } from 'sailpoint-api-client'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { FusionAccount } from '../../model/account'
import { FusionConfig } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { LogService } from '../logService'
import { SourceService } from '../sourceService'
import { MappingService } from '../mappingService'
import { DefinitionService } from '../definitionService'
import { FusionReportBlend } from '../../model/fusionReportBlend'
import { AggregationTracker } from '../../model/aggregationTracker'
import { assert } from '../../utils/assert'

export interface AccountAssemblyDeps {
    run: FusionRun
    sources: SourceService
    mappingService: MappingService
    definitionService: DefinitionService
    log: LogService
    config: FusionConfig
    commandType?: StandardCommand
    isAggregationMode?: boolean
    buildFusionBlend?: (fusionAccount: FusionAccount, account: Account) => FusionReportBlend
    getTracker?: () => AggregationTracker | undefined
}

export interface AssembleAccountOptions {
    addBlendHistory?: boolean
    skipBlendHistoryForManagedKeys?: ReadonlySet<string>
}

/**
 * Owns the shared account-assembly recipe used by the fusion, identity, and decision
 * processors: mode gate, managed-account layer, Map/Define attribute processing, and
 * registration in the run. Keeps origin-specific layering (identity, fusion decision,
 * correlation) in the callers.
 */
export class AccountAssembly {
    constructor(private readonly deps: AccountAssemblyDeps) {}

    public isAggregationAccountListMode(): boolean {
        return (
            this.deps.commandType === StandardCommand.StdAccountList ||
            this.deps.isAggregationMode === true
        )
    }

    public shouldPruneDeletedManagedAccounts(): boolean {
        return (
            this.isAggregationAccountListMode() ||
            this.deps.commandType === StandardCommand.StdAccountRead ||
            this.deps.commandType === StandardCommand.StdAccountUpdate ||
            this.deps.commandType === StandardCommand.StdAccountEnable ||
            this.deps.commandType === StandardCommand.StdAccountDisable
        )
    }

    private recordBlend(fusionAccount: FusionAccount, account: Account): void {
        if (!this.deps.buildFusionBlend) return
        this.deps.run.recordFusionBlend(
            this.deps.buildFusionBlend(fusionAccount, account),
            this.deps.getTracker?.()
        )
    }

    /**
     * Prepares a FusionAccount from a managed source account for scoring/dispatch.
     * Applies attribute mapping and normal attribute definitions.
     * This is the light assembly path used by the Match analyzer and outcome handler;
     * it intentionally does not add the managed-account layer or register the account.
     */
    public async assembleManagedAccount(account: Account): Promise<FusionAccount> {
        const fusionAccount = FusionAccount.fromManagedAccount(account)
        this.deps.log.debug(`Pre-processing managed account: ${account.name} [${account.sourceName}]`)
        await this.applyAttributeProcessing(fusionAccount)
        return fusionAccount
    }

    /**
     * Adds the managed-account layer to the supplied FusionAccount, applying the mode
     * gate and prune-deleted logic. This is the first half of the shared recipe;
     * callers may run additional steps before invoking {@link applyAttributeProcessing}.
     */
    public async addManagedAccountLayer(
        fusionAccount: FusionAccount,
        options: AssembleAccountOptions = {}
    ): Promise<void> {
        assert(this.deps.run.managedAccountsById, 'Managed accounts have not been loaded')
        fusionAccount.addManagedAccountLayer(
            this.deps.run,
            {
                pruneDeleted: this.shouldPruneDeletedManagedAccounts(),
                addBlendHistory: options.addBlendHistory ?? true,
                skipBlendHistoryForManagedKeys: options.skipBlendHistoryForManagedKeys,
                onBlend: (account) => this.recordBlend(fusionAccount, account),
            }
        )
        this.deps.log.debug(
            `Applied managed account layer for ${fusionAccount.name}: ` +
                `${fusionAccount.accountIdsSet.size} account(s), ${fusionAccount.missingAccountIdsSet.size} missing`
        )
    }

    /**
     * Applies the Map/Define attribute processing pipeline.
     */
    public async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
        this.deps.mappingService.mapAttributes(fusionAccount, this.deps.run)
        await this.deps.definitionService.refreshNormalAttributes(fusionAccount)
        this.deps.definitionService.refreshReverseCorrelationAttributes(fusionAccount)
    }

    /**
     * Adds the managed-account layer and applies attribute processing to the supplied
     * FusionAccount. This is the shared recipe used after origin-specific layers
     * (identity, fusion decision) have been applied, when no additional steps are needed
     * between the layer and attribute processing.
     *
     * Callers remain responsible for any correlation work and for registration via
     * {@link registerFusionAccount}.
     */
    public async assembleAccount(fusionAccount: FusionAccount, options: AssembleAccountOptions = {}): Promise<void> {
        await this.addManagedAccountLayer(fusionAccount, options)
        await this.applyAttributeProcessing(fusionAccount)
    }

    /**
     * Registers a FusionAccount in the run. This is the single registration seam so
     * processors do not duplicate the registration logic.
     */
    public registerFusionAccount(fusionAccount: FusionAccount): void {
        this.deps.run.registerFusionAccount(fusionAccount, this.deps.getTracker?.())
    }
}
