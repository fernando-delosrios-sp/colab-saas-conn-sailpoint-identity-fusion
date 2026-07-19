import { IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from '../../model/account'
import { FusionService } from './fusionService'
import { compact } from './collections'
import { buildManagedAccountKey } from '../../model/managedAccountKey'
import { readString } from '../../utils/safeRead'
import { assert } from '../../utils/assert'

export class IdentityProcessor {
    constructor(private fusionService: FusionService) {}

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
        const { identities } = this.fusionService.identities
        this.fusionService.tracker.identitiesProcessedCount = identities.length
        this.fusionService.log.info(
            `Processing identity documents: creating or merging fusion accounts for ${identities.length} ISC identity document(s)`
        )
        const results = await this.fusionService.batchProcess(identities, 'Identity documents', (x) => this.processIdentity(x))
        await this.fusionService.initializeSourceReviewers()
        this.fusionService.log.info(
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

        if (!this.fusionService.fusionIdentityMap.has(identityId)) {
            const existingAccount = this.findFusionAccountByIdentityManagedAccounts(identity)
            if (existingAccount) {
                this.fusionService.log.debug(
                    `Reusing existing Fusion account ${existingAccount.managedKey} for identity ` +
                        `${identity.name} (${identityId}) - prevents duplicate baseline creation`
                )
                // Remove from whichever map currently holds it
                if (this.fusionService.fusionAccountMap.get(existingAccount.managedKey) === existingAccount) {
                    this.fusionService.fusionAccountMap.delete(existingAccount.managedKey)
                } else {
                    for (const [staleId, fa] of this.fusionService.fusionIdentityMap.entries()) {
                        if (fa === existingAccount) {
                            this.fusionService.fusionIdentityMap.delete(staleId)
                            break
                        }
                    }
                }
                // Update identity reference; refresh mapping/normal defs but preserve unique attrs
                existingAccount.addIdentityLayer(identity)
                existingAccount.setIdentityIdAttribute(identityId)
                existingAccount.setNeedsRefresh(true)
                // Register under the new identity ID so callers (e.g. getFusionIdentity) can find it
                this.fusionService.fusionIdentityMap.set(identityId, existingAccount)
                this.fusionService.log.debug(
                    `Re-registered existing Fusion account under new identity: ${identity.name} (${identityId})`
                )
                return existingAccount
            }

            const fusionAccount = FusionAccount.fromIdentity(identity)
            this.fusionService.log.debug(`Processing new identity: ${identity.name} (${identityId})`)
            fusionAccount.addIdentityLayer(identity)
            fusionAccount.setNeedsReset(true)
            fusionAccount.setOriginIdentityInScope(true)

            assert(this.fusionService.run.managedAccountsById, 'Managed accounts have not been loaded')
            fusionAccount.addManagedAccountLayer(
                this.fusionService.run.managedAccountsById,
                this.fusionService.run.managedAccountsByIdentityId,
                this.fusionService.sources.managedAccountsAllById,
                this.fusionService.shouldPruneDeletedManagedAccounts(),
                false,
                undefined,
                (account) => this.fusionService.registerFusionBlend(fusionAccount, account)
            )

            await this.fusionService.applyAttributeProcessing(fusionAccount)

            this.fusionService.setFusionAccount(fusionAccount)
            this.fusionService.log.debug(`Registered identity as fusion account: ${identity.name} (${identityId})`)
            return fusionAccount
        }
        return undefined
    }

    private hasIntersectingManagedAccounts(account: FusionAccount, identityAccountIds: Set<string>): boolean {
        for (const id of account.accountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        for (const id of account.missingAccountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        return false
    }

    private findFusionAccountByIdentityManagedAccounts(identity: IdentityDocument): FusionAccount | undefined {
        const sourceNames = this.fusionService.configSourceNames
        const identityAccountIds = new Set<string>(
            (identity.accounts ?? [])
                .filter((a) => sourceNames.has(a.source?.name ?? ''))
                .map((a) =>
                    buildManagedAccountKey({
                        sourceId: a.source?.id,
                        nativeIdentity: readString(a, 'nativeIdentity'),
                    })
                )
                .filter((value): value is string => Boolean(value))
        )
        if (identityAccountIds.size === 0) return undefined

        // Check uncorrelated accounts first
        for (const account of this.fusionService.fusionAccountMap.values()) {
            if (this.hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        // Check for accounts from stale identity IDs
        for (const [existingIdentityId, account] of this.fusionService.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            if (this.hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        return undefined
    }
}
