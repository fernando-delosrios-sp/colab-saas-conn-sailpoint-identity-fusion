# Encapsulate FusionRun State Mutations — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform FusionRun from an anemic data bag with raw public Maps into a domain object with encapsulated collection-management methods. Absorb FusionAccountRepository into FusionRun.

**Architecture:** Add ~20 method to FusionRun that encapsulate all collection mutations currently scattered across 6+ callers. Move `findFusionAccountByIdentityManagedAccounts` from IdentityProcessor into FusionRun. Delete FusionAccountRepository (absorbed). Make formerly-public collection fields `private`.

**Tech Stack:** TypeScript, Vitest, Node.js

---

## Task 1: Add Fusion Account Registry methods to FusionRun

**Files:**
- Modify: `src/model/fusionRun.ts`
- Modify: `src/services/fusionService/fusionAccountRepository.ts` (read existing for absorption)

**Interfaces:**
- Consumes: `FusionAccount` (from `../../model/account`), `IdentityDocument` (from `sailpoint-api-client`), `AggregationTracker` (from `../services/fusionService/aggregationTracker`), `LogService` (from `../services/logService`)
- Produces: `registerFusionAccount(fa, tracker?)`, `removeFusionAccount(fa): boolean`, `getFusionIdentity(id): FusionAccount | undefined`, `getFusionAccountByManagedKey(key): FusionAccount | undefined`, `hasFusionIdentity(id): boolean`, `findFusionAccountForIdentity(identity, sourceNames): FusionAccount | undefined`, `totalFusionAccountCount`, `allFusionAccounts`, `allFusionIdentities`, `fusionIdentitiesExcluding`

- [ ] **Step 1: Add imports and LogService to FusionRun constructor**

Add these imports to `src/model/fusionRun.ts`:

```typescript
import { FusionAccount, FusionAccountKind } from './account'
import { IdentityDocument } from 'sailpoint-api-client'
import { AggregationTracker } from '../services/fusionService/aggregationTracker'
import { LogService } from '../services/logService'
import { hasValue } from '../utils/safeRead'
import { assert } from '../utils/assert'
import { buildManagedAccountKey } from './managedAccountKey'
import { readString } from '../utils/safeRead'
```

Add optional LogService to constructor:

```typescript
export class FusionRun implements WorkQueue {
    // ... existing fields ...

    constructor(private log?: LogService) {}
```

- [ ] **Step 2: Add fusion account registry methods before the snapshot() method**

```typescript
    registerFusionAccount(fusionAccount: FusionAccount, tracker?: AggregationTracker): void {
        const identityId = fusionAccount.identityId
        const hasIdentityId = hasValue(identityId)

        if (hasIdentityId && fusionAccount.type !== FusionAccountKind.Managed) {
            const existingFusionAccount = this.fusionIdentityMap.get(identityId!)
            if (existingFusionAccount) {
                this._trackConflictingFusionIdentity(identityId!, existingFusionAccount, fusionAccount, tracker)
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

    removeFusionAccount(fa: FusionAccount): boolean {
        const managedKey = fa.managedKey
        if (managedKey && this.fusionAccountMap.get(managedKey) === fa) {
            return this.fusionAccountMap.delete(managedKey)
        }
        for (const [id, account] of this.fusionIdentityMap.entries()) {
            if (account === fa) {
                return this.fusionIdentityMap.delete(id)
            }
        }
        return false
    }

    getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.fusionIdentityMap.get(identityId)
    }

    getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.fusionAccountMap.get(managedKey)
    }

    hasFusionIdentity(identityId: string): boolean {
        return this.fusionIdentityMap.has(identityId)
    }

    get totalFusionAccountCount(): number {
        return this.fusionIdentityMap.size + this.fusionAccountMap.size
    }

    get allFusionAccounts(): FusionAccount[] {
        return Array.from(this.fusionAccountMap.values())
    }

    get allFusionIdentities(): Iterable<FusionAccount> {
        return this.fusionIdentityMap.values()
    }

    *fusionIdentitiesExcluding(excludeIds: ReadonlySet<string>): Iterable<FusionAccount> {
        for (const identity of this.fusionIdentityMap.values()) {
            if (!identity.identityId || !excludeIds.has(identity.identityId)) {
                yield identity
            }
        }
    }

    findFusionAccountForIdentity(
        identity: IdentityDocument,
        sourceNames: Set<string>
    ): FusionAccount | undefined {
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

        for (const account of this.fusionAccountMap.values()) {
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        for (const [existingIdentityId, account] of this.fusionIdentityMap.entries()) {
            if (existingIdentityId === identity.id) continue
            if (this._hasIntersectingManagedAccounts(account, identityAccountIds)) {
                return account
            }
        }

        return undefined
    }

    private _hasIntersectingManagedAccounts(account: FusionAccount, identityAccountIds: Set<string>): boolean {
        for (const id of account.accountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        for (const id of account.missingAccountIdsSet) {
            if (identityAccountIds.has(id)) return true
        }
        return false
    }

    private _trackConflictingFusionIdentity(
        identityId: string,
        existingAccount: FusionAccount,
        newAccount: FusionAccount,
        tracker?: AggregationTracker
    ): void {
        if (!tracker || !this.log) return

        const getKey = (fa: FusionAccount) =>
            `${fa.managedKey ?? fa.name ?? 'unknown'}`

        let accounts = tracker.conflictingFusionIdentityAccounts.get(identityId)
        if (!accounts) {
            accounts = new Map()
            tracker.conflictingFusionIdentityAccounts.set(identityId, accounts)
        }

        const existingKey = getKey(existingAccount)
        const newKey = getKey(newAccount)
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
```

- [ ] **Step 3: Add reviewer state fields from FusionAccountRepository**

Add these public fields to FusionRun (near the other public fields):

```typescript
    readonly reviewersBySourceId = new Map<string, Set<FusionAccount>>()
    readonly sourcesWithoutReviewers = new Set<string>()
```

- [ ] **Step 4: Verify FusionRun compiles**

Run: `npx tsc --noEmit src/model/fusionRun.ts`
Expected: No errors.

---

## Task 2: Add identity cache methods to FusionRun

**Files:**
- Modify: `src/model/fusionRun.ts`

**Interfaces:**
- Produces: `addIdentity(id, doc)`, `removeIdentity(id)`, `clearIdentities()`, `getIdentity(id)`, `hasIdentity(id)`

- [ ] **Step 1: Add identity cache methods**

```typescript
    addIdentity(id: string, doc: IdentityDocument): void {
        this.identityMap.set(id, doc)
    }

    removeIdentity(id: string): void {
        this.identityMap.delete(id)
    }

    clearIdentities(): void {
        this.identityMap.clear()
    }

    getIdentity(id: string): IdentityDocument | undefined {
        return this.identityMap.get(id)
    }

    hasIdentity(id: string): boolean {
        return this.identityMap.has(id)
    }
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit src/model/fusionRun.ts`

---

## Task 3: Add scoring, index, decision, and review URL methods

**Files:**
- Modify: `src/model/fusionRun.ts`

**Interfaces:**
- Produces: `markAutoAssigned`, `isAutoAssigned`, `resetScoringState`, `initLinkedAccountIndex`, `clearLinkedAccountIndex`, `addDecision`, `clearDecisions`, `addReviewUrlForReviewer`, `addReviewUrlForCandidate`, `addPendingCandidateId`, `getReviewerUrls`, `getCandidateUrls`, `clearNonMatchedKeys`

- [ ] **Step 1: Add scoring state methods**

```typescript
    markAutoAssigned(identityId: string): void {
        this.autoAssignedIdentityIds.add(identityId)
    }

    isAutoAssigned(identityId: string): boolean {
        return this.autoAssignedIdentityIds.has(identityId)
    }

    resetScoringState(): void {
        this.autoAssignedIdentityIds.clear()
        this.matchScoringMs = 0
    }
```

- [ ] **Step 2: Add linked account index methods**

```typescript
    initLinkedAccountIndex(): void {
        this.linkedAccountKeyIndex = new Set<string>()
    }

    clearLinkedAccountIndex(): void {
        this.linkedAccountKeyIndex = undefined
    }
```

- [ ] **Step 3: Add decision methods**

```typescript
    addDecision(decision: FusionDecision): void {
        this.fusionIdentityDecisions.push(decision)
    }

    clearDecisions(): void {
        this.fusionIdentityDecisions = []
    }
```

- [ ] **Step 4: Add review URL tracking methods**

```typescript
    addReviewUrlForReviewer(reviewerId: string, url: string): void {
        const list = this.pendingReviewUrlsByReviewerId.get(reviewerId) ?? []
        list.push(url)
        this.pendingReviewUrlsByReviewerId.set(reviewerId, list)
    }

    addReviewUrlForCandidate(candidateId: string, url: string): void {
        const list = this.pendingReviewUrlsByCandidateId.get(candidateId) ?? []
        list.push(url)
        this.pendingReviewUrlsByCandidateId.set(candidateId, list)
    }

    addPendingCandidateId(candidateId: string): void {
        this.pendingCandidateIdentityIds.add(candidateId)
    }

    getReviewerUrls(reviewerId: string): string[] | undefined {
        return this.pendingReviewUrlsByReviewerId.get(reviewerId)
    }

    getCandidateUrls(candidateId: string): string[] | undefined {
        return this.pendingReviewUrlsByCandidateId.get(candidateId)
    }
```

- [ ] **Step 5: Add non-matched keys method**

```typescript
    clearNonMatchedKeys(): void {
        this.currentRunNonMatchedKeysBySource.clear()
    }
```

- [ ] **Step 6: Verify compiles**

Run: `npx tsc --noEmit src/model/fusionRun.ts`

---

## Task 4: Migrate identityProcessor.ts

**Files:**
- Modify: `src/services/fusionService/identityProcessor.ts`

- [ ] **Step 1: Replace `processIdentity` method**

Delete the private methods `hasIntersectingManagedAccounts` and `findFusionAccountByIdentityManagedAccounts` from IdentityProcessor.

Replace the body of `processIdentity`:

```typescript
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
                    pruneDeleted: this.deps.shouldPruneDeletedManagedAccounts(),
                    onBlend: (account) => this.deps.registerFusionBlend(fusionAccount, account),
                }
            )

            await this.deps.applyAttributeProcessing(fusionAccount)

            this.deps.setFusionAccount(fusionAccount)
            this.log.debug(`Registered identity as fusion account: ${identity.name} (${identityId})`)
            return fusionAccount
        }
        return undefined
    }
```

- [ ] **Step 2: Remove imports no longer needed**

Remove `buildManagedAccountKey` and `readString` from imports (moved to FusionRun).

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit src/services/fusionService/identityProcessor.ts`

---

## Task 5: Migrate fusionService.ts

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`

- [ ] **Step 1: Remove duplicate getFusionIdentity and getFusionAccountByManagedKey methods**

Find and delete these methods from FusionService:

```typescript
    // DELETE THIS METHOD
    getFusionIdentity(identityId: string): FusionAccount | undefined {
        return this.run.fusionIdentityMap.get(identityId)
    }

    // DELETE THIS METHOD
    getFusionAccountByManagedKey(managedKey: string): FusionAccount | undefined {
        return this.run.fusionAccountMap.get(managedKey)
    }
```

- [ ] **Step 2: Replace raw map access in fusionService.ts**

Search for `this.run.fusionIdentityMap.get(` → replace with `this.run.getFusionIdentity(`
Search for `this.run.fusionIdentityMap.has(` → replace with `this.run.hasFusionIdentity(`
Search for `this.run.fusionAccountMap.get(` → replace with `this.run.getFusionAccountByManagedKey(`

- [ ] **Step 3: Replace scoring state mutations**

Search for `this.run.autoAssignedIdentityIds.clear()` → replace with `this.run.resetScoringState()` (note: this also handles matchScoringMs = 0).

Search for `this.run.matchScoringMs = 0` — if standalone (not already inside resetScoringState), ensure it's replaced.

- [ ] **Step 4: Replace linked account index mutations**

Search for `this.run.linkedAccountKeyIndex = new Set<string>()` → replace with `this.run.initLinkedAccountIndex()`

Search for `this.run.linkedAccountKeyIndex = undefined` → replace with `this.run.clearLinkedAccountIndex()`

- [ ] **Step 5: Replace non-matched keys state**

Search for `this.run.currentRunNonMatchedKeysBySource.clear()` → replace with `this.run.clearNonMatchedKeys()`

- [ ] **Step 6: Verify compiles**

Run: `npx tsc --noEmit`

---

## Task 6: Migrate identityService.ts

**Files:**
- Modify: `src/services/identityService.ts`

- [ ] **Step 1: Replace identity cache mutations in fetchIdentities**

Before:
```typescript
this.run.identityMap.clear()
// ...fetch loop...
this.run.identityMap.set(identity.protected ? '-' : identity.id, identity)
// ...after loop...
this.run.identityMap.delete('-')
```

After:
```typescript
this.run.clearIdentities()
// ...fetch loop...
if (!identity.protected) {
    this.run.addIdentity(identity.id, identity)
}
// (no delete('-') needed — protected identities are never added)
```

- [ ] **Step 2: Replace identity reads and deletes**

Search for `this.run.identityMap.get(` → replace with `this.run.getIdentity(`
Search for `this.run.identityMap.delete(` → replace with `this.run.removeIdentity(`
Search for `this.run.identityMap.clear()` → replace with `this.run.clearIdentities()`

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit src/services/identityService.ts`

---

## Task 7: Migrate formService.ts

**Files:**
- Modify: `src/services/formService/formService.ts`

- [ ] **Step 1: Replace decision array mutations**

Search for `this.run.fusionIdentityDecisions = []` → replace with `this.run.clearDecisions()`
Search for `this.run.fusionIdentityDecisions.push(` → replace with `this.run.addDecision(`

- [ ] **Step 2: Replace review URL tracking mutations**

Search for pattern: `const list = this.run.pendingReviewUrlsByCandidateId.get(c.id) ?? []` followed by `list.push(` followed by `this.run.pendingReviewUrlsByCandidateId.set(c.id, list)` → replace with `this.run.addReviewUrlForCandidate(c.id, url)`

Search for pattern: `const list = this.run.pendingReviewUrlsByReviewerId.get(recipient.id) ?? []` followed by `list.push(` followed by `this.run.pendingReviewUrlsByReviewerId.set(recipient.id, list)` → replace with `this.run.addReviewUrlForReviewer(recipient.id, url)`

Search for `this.run.pendingCandidateIdentityIds.add(` → replace with `this.run.addPendingCandidateId(`

Search for `this.run.pendingReviewUrlsByReviewerId.get(` → replace with `this.run.getReviewerUrls(`
Search for `this.run.pendingReviewUrlsByCandidateId.get(` → replace with `this.run.getCandidateUrls(`

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`

---

## Task 8: Migrate managedAccountOutcomeHandler.ts and decisionProcessor.ts

**Files:**
- Modify: `src/services/matchingService/managedAccountOutcomeHandler.ts`
- Modify: `src/services/fusionService/decisionProcessor.ts`

- [ ] **Step 1: Migrate managedAccountOutcomeHandler.ts**

Search for `this.run.autoAssignedIdentityIds.add(` → replace with `this.run.markAutoAssigned(`

- [ ] **Step 2: Migrate decisionProcessor.ts**

Search for `this.run.fusionIdentityMap.get(` → replace with `this.run.getFusionIdentity(`

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`

---

## Task 9: Migrate FusionAccountRepository callers

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/fusionService/identityProcessor.ts` (if `setFusionAccount` is used via IdentityProcessorDeps)

- [ ] **Step 1: Find all imports and usages of FusionAccountRepository**

Search for `FusionAccountRepository` across `src/`:

```bash
grep -rn "FusionAccountRepository" src/
```

- [ ] **Step 2: Replace repository calls with FusionRun method calls**

Replace `repo.setFusionAccount(fa, tracker)` → `run.registerFusionAccount(fa, tracker)`
Replace `repo.getFusionIdentity(id)` → `run.getFusionIdentity(id)`
Replace `repo.getFusionAccountByManagedKey(key)` → `run.getFusionAccountByManagedKey(key)`
Replace `repo.totalFusionAccountCount` → `run.totalFusionAccountCount`
Replace `repo.fusionAccounts` → `run.allFusionAccounts`
Replace `repo.fusionIdentities` → `run.allFusionIdentities`
Replace `repo.fusionIdentitiesExcluding(ids)` → `run.fusionIdentitiesExcluding(ids)`
Replace `repo.clearCurrentRunState()` → `run.clearNonMatchedKeys()` + `this.run.autoAssignedIdentityIds.clear()` (or `run.resetScoringState()` if appropriate for context)
Replace `repo.reviewersBySourceId` → `run.reviewersBySourceId`
Replace `repo.sourcesWithoutReviewers` → `run.sourcesWithoutReviewers`

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`

---

## Task 10: Make fields private and delete FusionAccountRepository

**Files:**
- Modify: `src/model/fusionRun.ts`
- Delete: `src/services/fusionService/fusionAccountRepository.ts`

- [ ] **Step 1: Make collection fields private**

Change these fields from public/readonly to `private` in `src/model/fusionRun.ts`:

```typescript
    private readonly fusionAccountMap = new Map<string, FusionAccount>()
    private readonly fusionIdentityMap = new Map<string, FusionAccount>()
    private readonly identityMap = new Map<string, IdentityDocument>()
    private readonly autoAssignedIdentityIds = new Set<string>()
    private linkedAccountKeyIndex: Set<string> | undefined
    private fusionIdentityDecisions: FusionDecision[] = []
    private pendingCandidateIdentityIds: Set<string> = new Set()
    private readonly pendingReviewUrlsByReviewerId = new Map<string, string[]>()
    private readonly pendingReviewUrlsByCandidateId = new Map<string, string[]>()
    private readonly currentRunNonMatchedKeysBySource = new Map<string, Set<string>>()
```

- [ ] **Step 2: Update snapshot() to access private fields**

The `snapshot()` method already accesses these fields — ensure it reads from the private fields (if you used the same names, no change needed). Verify snapshot output is unchanged.

- [ ] **Step 3: Update restore() to access private fields**

Same check — `restore()` should still work with the private fields.

- [ ] **Step 4: Delete FusionAccountRepository**

```bash
rm src/services/fusionService/fusionAccountRepository.ts
```

- [ ] **Step 5: Remove FusionAccountRepository imports from all files**

Remove `import { FusionAccountRepository } from ...` wherever it appears.

- [ ] **Step 6: Verify compiles**

Run: `npx tsc --noEmit`

---

## Task 11: Update tests

**Files:**
- Modify: `src/model/__tests__/fusionRun.test.ts`
- Modify: test files with raw map access

- [ ] **Step 1: Add FusionRun method tests**

Add test cases to `src/model/__tests__/fusionRun.test.ts`:

```typescript
describe('FusionRun collection methods', () => {
    describe('registerFusionAccount', () => {
        it('should register managed account in fusionAccountMap', () => {
            const run = new FusionRun()
            const fa = createFusionAccount({ managedKey: 'key1', type: FusionAccountKind.Managed })
            run.registerFusionAccount(fa)
            expect(run.getFusionAccountByManagedKey('key1')).toBe(fa)
            expect(run.totalFusionAccountCount).toBe(1)
        })

        it('should register identity account in fusionIdentityMap', () => {
            const run = new FusionRun()
            const fa = createFusionAccount({ identityId: 'id1', type: FusionAccountKind.Baseline })
            run.registerFusionAccount(fa)
            expect(run.getFusionIdentity('id1')).toBe(fa)
            expect(run.totalFusionAccountCount).toBe(1)
        })
    })

    describe('removeFusionAccount', () => {
        it('should remove from fusionAccountMap by managedKey', () => {
            const run = new FusionRun()
            const fa = createFusionAccount({ managedKey: 'key1', type: FusionAccountKind.Managed })
            run.registerFusionAccount(fa)
            expect(run.removeFusionAccount(fa)).toBe(true)
            expect(run.getFusionAccountByManagedKey('key1')).toBeUndefined()
        })

        it('should remove from fusionIdentityMap by identityId', () => {
            const run = new FusionRun()
            const fa = createFusionAccount({ identityId: 'id1', type: FusionAccountKind.Baseline })
            run.registerFusionAccount(fa)
            expect(run.removeFusionAccount(fa)).toBe(true)
            expect(run.getFusionIdentity('id1')).toBeUndefined()
        })
    })

    describe('identity cache', () => {
        it('should add and get identity', () => {
            const run = new FusionRun()
            const doc = { id: 'id1', name: 'test' } as IdentityDocument
            run.addIdentity('id1', doc)
            expect(run.getIdentity('id1')).toBe(doc)
            expect(run.hasIdentity('id1')).toBe(true)
        })

        it('should remove identity', () => {
            const run = new FusionRun()
            run.addIdentity('id1', { id: 'id1' } as IdentityDocument)
            run.removeIdentity('id1')
            expect(run.hasIdentity('id1')).toBe(false)
        })

        it('should clear all identities', () => {
            const run = new FusionRun()
            run.addIdentity('id1', { id: 'id1' } as IdentityDocument)
            run.addIdentity('id2', { id: 'id2' } as IdentityDocument)
            run.clearIdentities()
            expect(run.hasIdentity('id1')).toBe(false)
            expect(run.hasIdentity('id2')).toBe(false)
        })
    })

    describe('scoring state', () => {
        it('should mark and check auto-assigned', () => {
            const run = new FusionRun()
            run.markAutoAssigned('id1')
            expect(run.isAutoAssigned('id1')).toBe(true)
            expect(run.isAutoAssigned('id2')).toBe(false)
        })

        it('should reset scoring state', () => {
            const run = new FusionRun()
            run.markAutoAssigned('id1')
            run.matchScoringMs = 5000
            run.resetScoringState()
            expect(run.isAutoAssigned('id1')).toBe(false)
            expect(run.matchScoringMs).toBe(0)
        })
    })

    describe('linked account index', () => {
        it('should init and clear linked account index', () => {
            const run = new FusionRun()
            run.initLinkedAccountIndex()
            expect(run.linkedAccountKeyIndex).toBeInstanceOf(Set)
            run.clearLinkedAccountIndex()
            expect(run.linkedAccountKeyIndex).toBeUndefined()
        })
    })

    describe('decisions', () => {
        it('should add and clear decisions', () => {
            const run = new FusionRun()
            const decision = { identityId: 'id1' } as FusionDecision
            run.addDecision(decision)
            expect(run.fusionIdentityDecisions).toHaveLength(1)
            run.clearDecisions()
            expect(run.fusionIdentityDecisions).toHaveLength(0)
        })
    })

    describe('review URLs', () => {
        it('should add and get reviewer URLs', () => {
            const run = new FusionRun()
            run.addReviewUrlForReviewer('reviewer1', 'url1')
            run.addReviewUrlForReviewer('reviewer1', 'url2')
            expect(run.getReviewerUrls('reviewer1')).toEqual(['url1', 'url2'])
        })

        it('should add and get candidate URLs', () => {
            const run = new FusionRun()
            run.addReviewUrlForCandidate('candidate1', 'url1')
            expect(run.getCandidateUrls('candidate1')).toEqual(['url1'])
        })

        it('should add pending candidate ID', () => {
            const run = new FusionRun()
            run.addPendingCandidateId('candidate1')
            expect(run.pendingCandidateIdentityIds.has('candidate1')).toBe(true)
        })
    })
})
```

- [ ] **Step 2: Update existing tests that access private fields**

Find tests using raw map access patterns (e.g., `run.fusionIdentityMap.get(...)`) and update to use public methods.

For tests that must access private fields (e.g., verifying internal state), use:
```typescript
const run = new FusionRun() as any
run.fusionIdentityMap.set(...)
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

---

## Task 12: Lint, build, and verify

**Files:** All modified files

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Fix any lint errors. Common issues: unused imports after removing FusionAccountRepository references.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit all changes**

```bash
git add -A
git commit -m "refactor: encapsulate FusionRun state mutations, absorb FusionAccountRepository"
```
