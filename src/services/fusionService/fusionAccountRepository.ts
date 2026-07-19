import { FusionAccount, FusionAccountKind } from '../../model/account'
import { hasValue } from '../../utils/safeRead'
import { assert } from '../../utils/assert'
import { getFusionIdentityConflictTrackingKey } from './helpers'
import { mapValuesToArray } from './collections'
import { LogService } from '../logService'
import { AggregationTracker } from './aggregationTracker'
import { FusionRun } from '../../model/fusionRun'

export class FusionAccountRepository {
    public readonly reviewersBySourceId: Map<string, Set<FusionAccount>> = new Map()
    public readonly sourcesWithoutReviewers: Set<string> = new Set()

    constructor(private log: LogService, private fusionRun: FusionRun) {}

    public get totalFusionAccountCount(): number {
        return this.fusionRun.fusionIdentityMap.size + this.fusionRun.fusionAccountMap.size
    }

    public get fusionAccounts(): FusionAccount[] {
        return mapValuesToArray(this.fusionRun.fusionAccountMap)
    }

    public get fusionIdentities(): Iterable<FusionAccount> {
        return this.fusionRun.fusionIdentityMap.values()
    }

    public *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.fusionRun.fusionIdentityMap.values()) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    public getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionRun.fusionIdentityMap.get(identityId)
    }

    public getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.fusionRun.fusionAccountMap.get(managedKey)
    }

    public setFusionAccount(fusionAccount: FusionAccount, tracker?: AggregationTracker): void {
        const identityId = fusionAccount.identityId
        const hasIdentityId = hasValue(identityId)

        if (hasIdentityId && fusionAccount.type !== FusionAccountKind.Managed) {
            const existingFusionAccount = this.fusionRun.fusionIdentityMap.get(identityId!)
            const existingKey = existingFusionAccount
                ? getFusionIdentityConflictTrackingKey(existingFusionAccount)
                : undefined
            const incomingKey = getFusionIdentityConflictTrackingKey(fusionAccount)
            if (existingFusionAccount && existingKey !== incomingKey) {
                this.trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount, tracker)
            }
            this.fusionRun.fusionIdentityMap.set(identityId!, fusionAccount)
        } else {
            assert(
                fusionAccount.managedKey,
                'Fusion account must have a managedKey to be added to fusion account map'
            )
            this.fusionRun.fusionAccountMap.set(fusionAccount.managedKey, fusionAccount)
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
        this.fusionRun.currentRunNonMatchedKeysBySource.clear()
        this.fusionRun.autoAssignedIdentityIds.clear()
    }
}
