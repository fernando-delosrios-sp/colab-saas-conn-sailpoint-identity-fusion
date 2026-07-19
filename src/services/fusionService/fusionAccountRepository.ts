import { FusionAccount, FusionAccountKind } from '../../model/account'
import { hasValue } from '../../utils/safeRead'
import { assert } from '../../utils/assert'
import { getFusionIdentityConflictTrackingKey } from './helpers'
import { mapValuesToArray } from './collections'
import { LogService } from '../logService'
import { AggregationTracker } from './aggregationTracker'

export class FusionAccountRepository {
    /**
     * Maps ISC identity id to the Fusion account that became that identity.
     * A Fusion identity is a Fusion account that has been promoted to an ISC identity.
     */
    public readonly fusionIdentityMap: Map<string, FusionAccount> = new Map()
    public readonly fusionAccountMap: Map<string, FusionAccount> = new Map()
    public readonly reviewersBySourceId: Map<string, Set<FusionAccount>> = new Map()
    public readonly sourcesWithoutReviewers: Set<string> = new Set()
    public readonly currentRunNonMatchedFusionManagedKeysBySource: Map<string, Set<string>> = new Map()
    public readonly autoAssignedIdentityIds: Set<string> = new Set()
    public linkedAccountKeyIndex: Set<string> | undefined

    constructor(private log: LogService) {}

    public get totalFusionAccountCount(): number {
        return this.fusionIdentityMap.size + this.fusionAccountMap.size
    }

    public get fusionAccounts(): FusionAccount[] {
        return mapValuesToArray(this.fusionAccountMap)
    }

    public get fusionIdentities(): Iterable<FusionAccount> {
        return this.fusionIdentityMap.values()
    }

    public *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.fusionIdentityMap.values()) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    public getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionIdentityMap.get(identityId)
    }

    public getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.fusionAccountMap.get(managedKey)
    }

    public setFusionAccount(fusionAccount: FusionAccount, tracker?: AggregationTracker): void {
        const identityId = fusionAccount.identityId
        const hasIdentityId = hasValue(identityId)

        if (hasIdentityId && fusionAccount.type !== FusionAccountKind.Managed) {
            const existingFusionAccount = this.fusionIdentityMap.get(identityId!)
            const existingKey = existingFusionAccount
                ? getFusionIdentityConflictTrackingKey(existingFusionAccount)
                : undefined
            const incomingKey = getFusionIdentityConflictTrackingKey(fusionAccount)
            if (existingFusionAccount && existingKey !== incomingKey) {
                this.trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount, tracker)
            }
            this.fusionIdentityMap.set(identityId!, fusionAccount)
        } else {
            assert(
                fusionAccount.managedKey,
                'Fusion account must have a managedKey to be added to fusion account map'
            )
            this.fusionAccountMap.set(fusionAccount.managedKey, fusionAccount)
        }
    }

    private trackConflictingFusionIdentity(
        identityId: string,
        existingAccount: FusionAccount,
        newAccount: FusionAccount,
        tracker?: AggregationTracker
    ): void {
        if (!tracker) return
        
        let accounts = tracker.conflictingFusionIdentityAccounts.get(identityId)
        if (!accounts) {
            accounts = new Map()
            tracker.conflictingFusionIdentityAccounts.set(identityId, accounts)
        }

        const existingKey = getFusionIdentityConflictTrackingKey(existingAccount)
        const newKey = getFusionIdentityConflictTrackingKey(newAccount)
        accounts.set(existingKey, existingAccount.name || existingAccount.displayName || existingKey)
        accounts.set(newKey, newAccount.name || newAccount.displayName || newKey)

        const accountLabels = Array.from(accounts.entries()).map(
            ([managedKey, name]) => `${name} (${managedKey})`
        )
        this.log.warn(
            `More than one Fusion account was found for identity ${identityId} (${accounts.size} account(s)): ${accountLabels.join(', ')}. ` +
                'This is generally caused by non-unique account names. Please review the configuration and consider using a unique attribute for the account name.'
        )
    }

    public clearCurrentRunState(): void {
        this.currentRunNonMatchedFusionManagedKeysBySource.clear()
        this.autoAssignedIdentityIds.clear()
    }
}
