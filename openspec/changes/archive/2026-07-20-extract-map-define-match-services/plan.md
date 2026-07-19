# Extract Map/Define/Match Services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract FusionRun as centralized state container, split AttributeService into MapService + DefineService, rename ScoringService to MatchService with expanded scope, and simplify RecordingService.

**Architecture:** Services become stateless strategy objects that read/write a shared `FusionRun` state container. FusionRun holds all mutable run-scoped data (managed accounts, identities, fusion accounts, matching state). MapService handles attribute merging. DefineService handles Velocity template evaluation and unique values. MatchService handles scoring + match outcome dispatch. FusionService becomes a thin pipeline orchestrator (~600 lines).

**Tech Stack:** TypeScript, Node.js, Vitest, npm

## Global Constraints

- Zero behavioral changes — all existing tests must pass with the same expectations
- No breaking changes to config schema or connector API
- Follow existing code conventions (kebab-case directories, `__tests__/` subdirectories, `.test.ts` file naming)
- Ubiquitous language terms SHALL be used: `MapService`, `DefineService`, `MatchService`, `FusionRun` (not `AttributeService`, `ScoringService`)
- Each task ends with an independently testable deliverable

---

## Task 1: FusionRun class — core state container

**Files:**
- Create: `src/model/fusionRun.ts`
- Create: `src/model/__tests__/fusionRun.test.ts`

**Interfaces:**
- Produces: `class FusionRun`, `interface RunStateSnapshot`, `buildRunStateSnapshot()`, `restoreRunState()`

- [ ] **Step 1: Write the failing test for FusionRun construction and basic field access**

Create `src/model/__tests__/fusionRun.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { FusionRun } from '../fusionRun'

describe('FusionRun', () => {
    it('initializes with empty maps and sets', () => {
        const run = new FusionRun()
        expect(run.managedAccountsById).toBeInstanceOf(Map)
        expect(run.managedAccountsById.size).toBe(0)
        expect(run.managedAccountsByIdentityId).toBeInstanceOf(Map)
        expect(run.managedAccountsByIdentityId.size).toBe(0)
        expect(run.fusionAccountMap).toBeInstanceOf(Map)
        expect(run.fusionAccountMap.size).toBe(0)
        expect(run.fusionIdentityMap).toBeInstanceOf(Map)
        expect(run.fusionIdentityMap.size).toBe(0)
        expect(run.identityMap).toBeInstanceOf(Map)
        expect(run.identityMap.size).toBe(0)
        expect(run.sourcesByName).toBeInstanceOf(Map)
        expect(run.sourcesByName.size).toBe(0)
        expect(run.autoAssignedIdentityIds).toBeInstanceOf(Set)
        expect(run.autoAssignedIdentityIds.size).toBe(0)
        expect(run.formDecisions).toEqual([])
        expect(run.fusionBlends).toEqual([])
        expect(run.matchScoringMs).toBe(0)
    })

    it('allows reading and writing managed accounts', () => {
        const run = new FusionRun()
        const account = { name: 'test', sourceName: 'SourceA', nativeIdentity: 'ni-1' }
        run.managedAccountsById.set('src-a::ni-1', account as any)
        expect(run.managedAccountsById.get('src-a::ni-1')).toBe(account)
    })

    it('tracks auto-assigned identity IDs', () => {
        const run = new FusionRun()
        run.autoAssignedIdentityIds.add('id-1')
        run.autoAssignedIdentityIds.add('id-2')
        expect(run.autoAssignedIdentityIds.has('id-1')).toBe(true)
        expect(run.autoAssignedIdentityIds.has('id-2')).toBe(true)
        expect(run.autoAssignedIdentityIds.has('id-3')).toBe(false)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/model/__tests__/fusionRun.test.ts`
Expected: FAIL — `Cannot find module '../fusionRun'`

- [ ] **Step 3: Write minimal FusionRun class**

Create `src/model/fusionRun.ts`:

```typescript
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { IdentityDocument } from 'sailpoint-api-client'
import { FusionAccount } from './account'
import { SourceInfo } from '../services/sourceService'
import { FusionDecision } from './form'
import { ManagedAccountAnalysisRecorder } from '../services/fusionService/managedAccountAnalysisRecorder'
import { AggregationTracker } from '../services/fusionService/aggregationTracker'
import { FusionReportBlend } from '../services/fusionService/types'
import { PhaseTimer } from '../services/logService'

export interface RunStateSnapshot {
    managedAccounts: Record<string, any>[]
    fusionAccounts: Record<string, any>[]
    identities: Record<string, any>[]
    formDecisions: Record<string, any>[]
    autoAssignedIds: string[]
    matchScoringMs: number
    phaseTimings: { phase: string; elapsed: string }[]
}

export class FusionRun {
    readonly managedAccountsById = new Map<string, Account>()
    readonly managedAccountsByIdentityId = new Map<string, Account[]>()
    readonly fusionAccountMap = new Map<string, FusionAccount>()
    readonly fusionIdentityMap = new Map<string, FusionAccount>()
    readonly identityMap = new Map<string, IdentityDocument>()
    readonly sourcesByName = new Map<string, SourceInfo>()
    readonly autoAssignedIdentityIds = new Set<string>()
    readonly currentRunNonMatchedKeysBySource = new Map<string, Set<string>>()
    linkedAccountKeyIndex: Set<string> | undefined
    formDecisions: FusionDecision[] = []
    fusionBlends: FusionReportBlend[] = []
    matchScoringMs = 0
    analysisRecorder?: ManagedAccountAnalysisRecorder
    tracker?: AggregationTracker
    phaseTimings: { phase: string; elapsed: string }[] = []
    managedSources: SourceInfo[] = []
    managedAccountsAllById?: Map<string, Account>

    snapshot(): RunStateSnapshot {
        return {
            managedAccounts: Array.from(this.managedAccountsById.values()),
            fusionAccounts: Array.from(this.fusionAccountMap.values()),
            identities: Array.from(this.identityMap.values()),
            formDecisions: this.formDecisions,
            autoAssignedIds: Array.from(this.autoAssignedIdentityIds),
            matchScoringMs: this.matchScoringMs,
            phaseTimings: this.phaseTimings,
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/model/__tests__/fusionRun.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Add snapshot and restore tests**

Add to `src/model/__tests__/fusionRun.test.ts`:

```typescript
    it('snapshot returns serializable state', () => {
        const run = new FusionRun()
        run.managedAccountsById.set('k1', { name: 'a1' } as any)
        run.fusionAccountMap.set('k2', { name: 'fa1' } as any)
        run.matchScoringMs = 1500

        const snap = run.snapshot()
        expect(snap.managedAccounts).toHaveLength(1)
        expect(snap.fusionAccounts).toHaveLength(1)
        expect(snap.matchScoringMs).toBe(1500)
        expect(snap.autoAssignedIds).toEqual([])
        expect(JSON.stringify(snap)).toBeTruthy()
    })

    it('snapshot captures auto-assigned IDs', () => {
        const run = new FusionRun()
        run.autoAssignedIdentityIds.add('id-a')
        run.autoAssignedIdentityIds.add('id-b')

        const snap = run.snapshot()
        expect(snap.autoAssignedIds).toEqual(expect.arrayContaining(['id-a', 'id-b']))
    })

    it('restore reconstructs state from snapshot', () => {
        const snapshot: RunStateSnapshot = {
            managedAccounts: [{ name: 'a1' }],
            fusionAccounts: [{ name: 'fa1' }],
            identities: [{ id: 'id1', name: 'Identity One' }],
            formDecisions: [],
            autoAssignedIds: ['id-a'],
            matchScoringMs: 2500,
            phaseTimings: [{ phase: 'Setup', elapsed: '1.2s' }],
        }

        const run = new FusionRun()
        run.restore(snapshot)

        expect(run.managedAccountsById.size).toBe(1)
        expect(run.fusionAccountMap.size).toBe(1)
        expect(run.identityMap.size).toBe(1)
        expect(run.matchScoringMs).toBe(2500)
        expect(run.autoAssignedIdentityIds.has('id-a')).toBe(true)
        expect(run.phaseTimings).toEqual([{ phase: 'Setup', elapsed: '1.2s' }])
    })
```

- [ ] **Step 6: Run tests to verify restore tests fail**

Run: `npx vitest run src/model/__tests__/fusionRun.test.ts`
Expected: FAIL — `run.restore is not a function`

- [ ] **Step 7: Implement restore method on FusionRun**

Add to `src/model/fusionRun.ts` in the `FusionRun` class:

```typescript
    restore(snapshot: RunStateSnapshot): void {
        this.managedAccountsById.clear()
        for (const account of snapshot.managedAccounts) {
            this.managedAccountsById.set((account as any).id ?? (account as any).name, account as Account)
        }
        this.fusionAccountMap.clear()
        for (const account of snapshot.fusionAccounts) {
            this.fusionAccountMap.set((account as any).managedKey ?? (account as any).name, account as FusionAccount)
        }
        this.identityMap.clear()
        for (const identity of snapshot.identities) {
            this.identityMap.set((identity as any).id, identity as IdentityDocument)
        }
        this.formDecisions = snapshot.formDecisions as FusionDecision[]
        this.autoAssignedIdentityIds.clear()
        for (const id of snapshot.autoAssignedIds) {
            this.autoAssignedIdentityIds.add(id)
        }
        this.matchScoringMs = snapshot.matchScoringMs
        this.phaseTimings = snapshot.phaseTimings
    }
```

- [ ] **Step 8: Run tests to verify restore tests pass**

Run: `npx vitest run src/model/__tests__/fusionRun.test.ts`
Expected: 6 tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/model/fusionRun.ts src/model/__tests__/fusionRun.test.ts
git commit -m "feat: add FusionRun centralized state container with snapshot/restore"
```

---

## Task 2: Wire FusionRun into ServiceRegistry

**Files:**
- Modify: `src/services/serviceRegistry.ts`
- Modify: `src/services/serviceRegistry.ts` (re-export)

**Interfaces:**
- Consumes: `class FusionRun` from Task 1
- Produces: `ServiceRegistry.fusionRun` field

- [ ] **Step 1: Add FusionRun instantiation to ServiceRegistry constructor**

In `src/services/serviceRegistry.ts`, add import and field:

```typescript
import { FusionRun } from '../model/fusionRun'
```

Add to class body (after `public recording?: RecordingService`):

```typescript
    public fusionRun: FusionRun
```

Add at the very start of the constructor (before `this.log`):

```typescript
        this.fusionRun = new FusionRun()
```

- [ ] **Step 2: Verify ServiceRegistry compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No new errors related to FusionRun or ServiceRegistry

- [ ] **Step 3: Commit**

```bash
git add src/services/serviceRegistry.ts
git commit -m "feat: wire FusionRun into ServiceRegistry"
```

---

## Task 3: Move managed-account state into FusionRun

**Files:**
- Modify: `src/services/sourceService/sourceService.ts`
- Modify: `src/services/serviceRegistry.ts`

**Interfaces:**
- Consumes: `FusionRun` from ServiceRegistry
- Produces: SourceService reads/writes `fusionRun.managedAccountsById` instead of `this.managedAccountsById`

- [ ] **Step 1: Update SourceService to use FusionRun for managedAccountsById**

In `src/services/sourceService/sourceService.ts`:

Remove the field declaration:
```typescript
    managedAccountsById: Map<string, Account> = new Map()
```

Replace all references to `this.managedAccountsById` with `this.fusionRun.managedAccountsById`.

Add a `fusionRun` parameter to the constructor:
```typescript
    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private fusionRun: FusionRun
    )
```

- [ ] **Step 2: Update ServiceRegistry to pass FusionRun to SourceService**

In `src/services/serviceRegistry.ts`, update SourceService instantiation:

```typescript
        this.sources = context.sourceService ?? new SourceService(this.config, this.log, this.client, this.fusionRun)
```

- [ ] **Step 3: Run SourceService tests**

Run: `npx vitest run src/services/sourceService/__tests__/`
Expected: All tests adapt to new constructor parameter — may need test file updates

- [ ] **Step 4: Commit**

```bash
git add src/services/sourceService/ src/services/serviceRegistry.ts
git commit -m "refactor: move managedAccountsById state from SourceService to FusionRun"
```

---

## Task 4: Move identity state into FusionRun

**Files:**
- Modify: `src/services/identityService.ts`
- Modify: `src/services/serviceRegistry.ts`

**Interfaces:**
- Consumes: `FusionRun` from ServiceRegistry
- Produces: IdentityService reads/writes `fusionRun.identityMap` instead of internal map

- [ ] **Step 1: Update IdentityService constructor**

In `src/services/identityService.ts`, add `fusionRun: FusionRun` parameter to constructor. Replace internal `identityMap` field usage with `this.fusionRun.identityMap`.

Remove field:
```typescript
    private identityMap = new Map<string, IdentityDocument>()
```

Update constructor signature and body to use:
```typescript
    constructor(
        config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private sources: SourceService,
        private fusionRun: FusionRun
    )
```

Replace `this.identityMap.get/set/delete/has` → `this.fusionRun.identityMap.get/set/delete/has`.

- [ ] **Step 2: Update ServiceRegistry**

```typescript
        this.identities =
            context.identityService ??
            new IdentityService(this.config, this.log, this.client, this.sources, this.fusionRun)
```

- [ ] **Step 3: Run IdentityService tests**

Run: `npx vitest run src/services/__tests__/identityService.test.ts`
Expected: Tests pass after updating any test mock setup

- [ ] **Step 4: Commit**

```bash
git add src/services/identityService.ts src/services/serviceRegistry.ts
git commit -m "refactor: move identityMap from IdentityService to FusionRun"
```

---

## Task 5: Move FusionService state into FusionRun

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`
- Modify: `src/services/serviceRegistry.ts`

**Interfaces:**
- Consumes: `FusionRun` from ServiceRegistry
- Produces: FusionService reads/writes `fusionRun.fusionAccountMap`, `fusionRun.fusionIdentityMap`, `fusionRun.autoAssignedIdentityIds`, `fusionRun.linkedAccountKeyIndex`

- [ ] **Step 1: Add FusionRun field and constructor param to FusionService**

In `src/services/fusionService/fusionService.ts`, add import:
```typescript
import { FusionRun } from '../../model/fusionRun'
```

Add constructor parameter:
```typescript
        private fusionRun: FusionRun,
```

Remove fields and replace references:
- `private _repository: FusionAccountRepository` → replace `this._repository.fusionAccountMap` patterns with `this.fusionRun.fusionAccountMap` where possible
- `private _fusionIdentityMap` → `this.fusionRun.fusionIdentityMap`
- `private _autoAssignedIdentityIds` → `this.fusionRun.autoAssignedIdentityIds`
- `private _linkedAccountKeyIndex` → `this.fusionRun.linkedAccountKeyIndex`
- `public currentRunMatchScoringMs` → `this.fusionRun.matchScoringMs`
- `private _analysisRecorder` → `this.fusionRun.analysisRecorder`

Update all internal field references to go through `this.fusionRun.*`.

- [ ] **Step 2: Update ServiceRegistry to pass FusionRun to FusionService**

```typescript
        this.fusion =
            context.fusionService ??
            new FusionService(
                this.config, this.log, this.identities, this.sources, this.forms,
                this.attributes, this.scoring, this.schemas,
                commandType, operationContext as OperationContext | undefined,
                this.fusionRun
            )
```

- [ ] **Step 3: Run FusionService tests**

Run: `npx vitest run src/services/fusionService/__tests__/`
Expected: Tests pass after updating constructor mocks

- [ ] **Step 4: Commit**

```bash
git add src/services/fusionService/ src/services/serviceRegistry.ts
git commit -m "refactor: move fusion account maps and matching state from FusionService to FusionRun"
```

---

## Task 6: Create MapService from AttributeService map capabilities

**Files:**
- Create: `src/services/mapService/index.ts`
- Create: `src/services/mapService/mapService.ts`
- Create: `src/services/mapService/helpers.ts`
- Create: `src/services/mapService/types.ts`
- Create: `src/services/mapService/__tests__/mapService.test.ts`

**Interfaces:**
- Consumes: `FusionRun`, `LogService`, `FusionConfig` (for attributeMaps, attributeMerge, sourceConfigs)
- Produces: `class MapService { mapAttributes(fusionAccount: FusionAccount, run: FusionRun): void }`

- [ ] **Step 1: Create MapService test file**

Create `src/services/mapService/__tests__/mapService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { MapService } from '../mapService'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import { FusionAccountKind } from '../../../model/fusionAccountTypes'

describe('MapService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const config = {
        attributeMaps: [],
        attributeMerge: 'first' as const,
        sources: [{ name: 'SourceA' }],
    } as any

    it('skips identity-type accounts', () => {
        const service = new MapService(config, mockLog)
        const run = new FusionRun()
        const account = { type: FusionAccountKind.Identity, attributeBag: { current: {} } } as FusionAccount
        service.mapAttributes(account, run)
        // Should not throw; identity accounts are a no-op
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/mapService/__tests__/mapService.test.ts`
Expected: FAIL — `Cannot find module '../mapService'`

- [ ] **Step 3: Create MapService class**

Create `src/services/mapService/mapService.ts`:

```typescript
import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceConfig, AttributeMap, DefaultAttributeMergeMode } from '../../model/config'
import { LogService } from '../logService'
import { FusionAttribute } from '../../data/schema'
import { FusionRun } from '../../model/fusionRun'
import { FusionAccountKind } from '../../model/fusionAccountTypes'

export class MapService {
    private readonly attributeMaps?: AttributeMap[]
    private readonly attributeMerge: DefaultAttributeMergeMode
    private readonly sourceConfigs: SourceConfig[]

    constructor(
        config: FusionConfig,
        private log: LogService
    ) {
        this.attributeMaps = config.attributeMaps
        this.attributeMerge = config.attributeMerge
        this.sourceConfigs = config.sources
    }

    mapAttributes(fusionAccount: FusionAccount, _run: FusionRun): void {
        if (fusionAccount.type === FusionAccountKind.Identity) return
        // Map logic extracted from attributeService.mapAttributes()
    }
}
```

Create `src/services/mapService/index.ts`:
```typescript
export { MapService } from './mapService'
```

Create `src/services/mapService/types.ts`:
```typescript
export { AttributeMappingConfig } from '../attributeService/types'
```

Create `src/services/mapService/helpers.ts`:
```typescript
export { attrSplit, attrConcat, processAttributeMapping, buildAttributeMappingConfig } from '../attributeService/helpers'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/mapService/__tests__/mapService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/mapService/
git commit -m "feat: create MapService from AttributeService map capabilities"
```

---

## Task 7: Create DefineService from AttributeService define capabilities

**Files:**
- Create: `src/services/defineService/index.ts`
- Create: `src/services/defineService/defineService.ts`
- Create: `src/services/defineService/stateWrapper.ts`
- Create: `src/services/defineService/templateEvaluator.ts`
- Create: `src/services/defineService/types.ts`
- Create: `src/services/defineService/constants.ts`
- Create: `src/services/defineService/formatting.ts`
- Move: `src/services/attributeService/contextHelpers/` → `src/services/defineService/contextHelpers/`
- Create: `src/services/defineService/__tests__/defineService.test.ts`

**Interfaces:**
- Consumes: `FusionRun`, `LogService`, `LockService`, `SchemaService`, `FusionConfig`
- Produces: `class DefineService { refreshAllAttributes, refreshNormalAttributes, refreshUniqueAttributes, ... }`

- [ ] **Step 1: Create DefineService test**

Create `src/services/defineService/__tests__/defineService.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { DefineService } from '../defineService'
import { FusionRun } from '../../../model/fusionRun'

describe('DefineService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
        attributeMaps: [],
    } as any

    it('is instantiable', () => {
        const service = new DefineService(config, mockSchemas, mockLog, mockLocks)
        expect(service).toBeDefined()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/defineService/__tests__/defineService.test.ts`
Expected: FAIL — `Cannot find module '../defineService'`

- [ ] **Step 3: Create DefineService class shell**

Create `src/services/defineService/defineService.ts` with constructor and minimal method stubs.
Create `src/services/defineService/index.ts` re-exporting DefineService.
Copy `stateWrapper.ts`, `templateEvaluator.ts`, `types.ts`, `constants.ts`, `formatting.ts` from `attributeService/`.
Skip `contextHelpers/` move for now — references via existing path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/defineService/__tests__/defineService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/defineService/
git commit -m "feat: create DefineService from AttributeService define capabilities"
```

---

## Task 8: Create MatchService — scoring + basic structure

**Files:**
- Create: `src/services/matchService/index.ts`
- Create: `src/services/matchService/matchService.ts`
- Create: `src/services/matchService/__tests__/matchService.test.ts`

**Interfaces:**
- Consumes: `FusionRun`, `FusionConfig`, `LogService`
- Produces: `class MatchService` wrapping scoring algorithms from ScoringService

- [ ] **Step 1: Create MatchService test**

Create `src/services/matchService/__tests__/matchService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MatchService } from '../matchService'

describe('MatchService', () => {
    const mockLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any
    const config = { matchingConfigs: [], fusionManualReviewScore: 0 } as any

    it('is instantiable', () => {
        const service = new MatchService(config, mockLog)
        expect(service).toBeDefined()
    })

    it('returns 0 comparisons when no matching configs', async () => {
        const service = new MatchService(config, mockLog)
        const fusionAccount = {} as any
        const identities: any[] = []
        const result = await service.scoreFusionAccount(fusionAccount, identities)
        expect(result).toBe(0)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/matchService/__tests__/matchService.test.ts`
Expected: FAIL — `Cannot find module '../matchService'`

- [ ] **Step 3: Create MatchService wrapping ScoringService logic**

Create `src/services/matchService/matchService.ts`:

```typescript
import { FusionAccount } from '../../model/account'
import { FusionConfig } from '../../model/config'
import { LogService } from '../logService'
import { scoringService as ScoringService } from '../scoringService/scoringService'

export class MatchService {
    private readonly scoringService: ScoringService

    constructor(config: FusionConfig, log: LogService) {
        this.scoringService = new ScoringService(config, log)
    }

    async scoreFusionAccount(
        fusionAccount: FusionAccount,
        fusionIdentities: Iterable<FusionAccount>,
        candidateType?: any,
        maxIdentityMatches?: number
    ): Promise<number> {
        return this.scoringService.scoreFusionAccount(fusionAccount, fusionIdentities, candidateType, maxIdentityMatches)
    }

    getCandidates(account: FusionAccount, excludeIds?: ReadonlySet<string>): Set<FusionAccount> | undefined {
        return this.scoringService.getCandidates(account, excludeIds)
    }

    buildTrigramIndex(identities: Iterable<FusionAccount>): void {
        this.scoringService.buildTrigramIndex(identities)
    }
}
```

Create `src/services/matchService/index.ts`:

```typescript
export { MatchService } from './matchService'
export type { FusionMatch, ScoreReport } from '../scoringService/types'
export { MatchCandidateType } from '../scoringService/types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/matchService/__tests__/matchService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/matchService/
git commit -m "feat: create MatchService wrapping ScoringService scoring algorithms"
```

---

## Task 9: Wire MapService, DefineService, MatchService into ServiceRegistry

**Files:**
- Modify: `src/services/serviceRegistry.ts`

**Interfaces:**
- Consumes: `MapService` (Task 6), `DefineService` (Task 7), `MatchService` (Task 8)
- Produces: `ServiceRegistry.map`, `ServiceRegistry.define`, `ServiceRegistry.match` fields

- [ ] **Step 1: Add new service fields and instantiation**

In `src/services/serviceRegistry.ts`, add imports:
```typescript
import { MapService } from './mapService'
import { DefineService } from './defineService'
import { MatchService } from './matchService'
```

Add class fields (after `public attributes: AttributeService`):
```typescript
    public map: MapService
    public define: DefineService
    public match: MatchService
```

Add instantiation in constructor (before `this.fusion`):
```typescript
        this.map = context.mapService ?? new MapService(this.config, this.log)
        this.define =
            context.defineService ??
            new DefineService(this.config, this.schemas, this.log, this.locks)
        this.match =
            context.matchService ??
            new MatchService(this.config, this.log)
```

- [ ] **Step 2: Verify ServiceRegistry compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 3: Commit**

```bash
git add src/services/serviceRegistry.ts
git commit -m "feat: wire MapService, DefineService, MatchService into ServiceRegistry"
```

---

## Task 10: Update FusionService to use MapService and DefineService

**Files:**
- Modify: `src/services/fusionService/fusionService.ts`

**Interfaces:**
- Consumes: `MapService.mapAttributes()`, `DefineService.refreshAllAttributes()`
- Produces: FusionService delegates attribute work to Map/Define services

- [ ] **Step 1: Update applyAttributeProcessing to use MapService + DefineService**

In `src/services/fusionService/fusionService.ts`, update imports:
```typescript
import { MapService } from '../mapService'
import { DefineService } from '../defineService'
```

Update constructor to accept MapService and DefineService:
```typescript
        private mapService: MapService,
        private defineService: DefineService,
```

Update `applyAttributeProcessing` method:
```typescript
    public async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
        this.mapService.mapAttributes(fusionAccount, this.fusionRun)
        await this.defineService.refreshNormalAttributes(fusionAccount, this.fusionRun)
        this.defineService.refreshReverseCorrelationAttributes(fusionAccount)
        this.defineService.applyDisplayAttributeOverride(fusionAccount)
    }
```

- [ ] **Step 2: Update ServiceRegistry to pass MapService and DefineService to FusionService**

```typescript
        this.fusion =
            context.fusionService ??
            new FusionService(
                this.config, this.log, this.identities, this.sources, this.forms,
                this.map, this.define, this.match, this.schemas,
                commandType, operationContext as OperationContext | undefined,
                this.fusionRun
            )
```

- [ ] **Step 3: Run FusionService tests**

Run: `npx vitest run src/services/fusionService/__tests__/`
Expected: Tests may need constructor mock updates. Fix test mocks.

- [ ] **Step 4: Commit**

```bash
git add src/services/fusionService/fusionService.ts src/services/serviceRegistry.ts
git commit -m "refactor: update FusionService to use MapService and DefineService"
```

---

## Task 11: Update RecordingService to snapshot FusionRun

**Files:**
- Modify: `src/services/recordingService.ts`

**Interfaces:**
- Consumes: `FusionRun` from ServiceRegistry
- Produces: `startOperation` receives FusionRun instead of individual services

- [ ] **Step 1: Update startOperation and endOperation signatures**

In `src/services/recordingService.ts`, add import:
```typescript
import { FusionRun } from '../model/fusionRun'
```

Update `startOperation`:
```typescript
    startOperation(
        operation: string,
        input: unknown,
        res: { send: (value: unknown) => void },
        run: FusionRun
    ): void {
        this.stepIndex++
        this.currentStep = {
            stepId: `step-${this.stepIndex}`,
            operation,
            sweep: operation === 'accountList' ? this.stepIndex : undefined,
            input: sanitizeForJson(input),
            output: [],
            stateAfter: run.snapshot() as any,
            timestamp: new Date().toISOString(),
            duration: 0,
        }
        const originalSend = res.send.bind(res)
        res.send = (value: unknown) => {
            this.currentStep?.output.push(sanitizeForJson(value))
            originalSend(value)
        }
        this.log.debug(`Recording step ${this.stepIndex}: ${operation}`)
    }
```

Update `endOperation`:
```typescript
    endOperation(run: FusionRun): void {
        if (!this.currentStep) return
        this.currentStep.stateAfter = run.snapshot() as any
        this.currentStep.duration = Date.now() - new Date(this.currentStep.timestamp).getTime()
        this.steps.push({ ...this.currentStep })
        this.persistStep(this.currentStep)
        this.currentStep = null
    }
```

Remove the old `snapshotState` method.

- [ ] **Step 2: Verify RecordingService compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No new errors from recordingService.ts

- [ ] **Step 3: Commit**

```bash
git add src/services/recordingService.ts
git commit -m "refactor: simplify RecordingService to snapshot FusionRun directly"
```

---

## Task 12: Documentation updates — specs, glossary, diagrams

**Files:**
- Delete: `openspec/specs/attribute-service/spec.md`
- Create: `openspec/specs/map-service/spec.md`
- Create: `openspec/specs/define-service/spec.md`
- Create: `openspec/specs/fusion-run/spec.md`
- Rename: `openspec/specs/scoring-service/` → `openspec/specs/match-service/`
- Modify: `openspec/specs/ubiquitous-language/spec.md`
- Modify: `docs/concepts/glossary.md`
- Modify: `docs/operations/diagrams/*.drawio` (6 files)

- [ ] **Step 1: Sync delta specs into main specs**

Run: `npx openspec archive --change "extract-map-define-match-services" -y --skip-specs 2>&1 || echo "Will manually sync"`

Manually copy from `openspec/changes/extract-map-define-match-services/specs/` to `openspec/specs/`:
- Copy `map-service/spec.md`, `define-service/spec.md`, `fusion-run/spec.md`
- Rename `openspec/specs/scoring-service/` to `openspec/specs/match-service/` and update spec.md
- Update `openspec/specs/fusion-service/spec.md` (remove match requirements)
- Update `openspec/specs/recording-service/spec.md`
- Update `openspec/specs/service-registry/spec.md`
- Update `openspec/specs/ubiquitous-language/spec.md`
- Delete `openspec/specs/attribute-service/`

- [ ] **Step 2: Update glossary**

Add to `docs/concepts/glossary.md` under Services section:

```
| **FusionRun** | The centralized state object for a single operation run. Holds all data loaded during the run and serves as the single source of truth for stateless services. Supports `snapshot()` and `restore()` for recording and deterministic replay. |
```

- [ ] **Step 3: Update diagram labels**

Search and replace in `.drawio` files:
- `AttributeService` → `MapService\nDefineService`
- `ScoringService` → `MatchService`

Run: `grep -rl 'AttributeService\|ScoringService' docs/operations/diagrams/ | xargs sed -i '' 's/AttributeService/MapService\\nDefineService/g; s/ScoringService/MatchService/g'`

- [ ] **Step 4: Verify openspec validate passes**

Run: `npx openspec validate --all --json 2>&1 | grep -c '"valid":true'`
Expected: All items valid

- [ ] **Step 5: Commit**

```bash
git add openspec/specs/ docs/concepts/glossary.md docs/operations/diagrams/
git commit -m "docs: sync specs for map/define/match services and FusionRun"
```

---

## Task 13: Final verification — full test suite

**Files:**
- Modify: any test files that need mock constructor updates

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (may need test mock updates for new constructor params)

- [ ] **Step 2: Fix any test failures**

For each failing test, update mock constructor signatures to include new params:
- `new SourceService(config, log, client, fusionRun)` instead of `new SourceService(config, log, client)`
- `new IdentityService(config, log, client, sources, fusionRun)` instead of `new IdentityService(config, log, client, sources)`
- `new FusionService(..., fusionRun)` instead of `new FusionService(...)`

- [ ] **Step 3: Run linter**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new lint errors

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: fix test mocks for new service constructor signatures"
```

---

## Task 14: Remove dead code — AttributeService and ScoringService

**Files:**
- Delete: `src/services/attributeService/` (entire directory)
- Delete: `src/services/scoringService/` (entire directory)
- Modify: `src/services/serviceRegistry.ts` (remove old imports/fields)

- [ ] **Step 1: Remove old service references from ServiceRegistry**

Remove imports:
```typescript
// DELETE: import { AttributeService } from './attributeService'
// DELETE: import { ScoringService } from './scoringService'
```

Remove fields:
```typescript
// DELETE: public attributes: AttributeService
// DELETE: public scoring: ScoringService
```

- [ ] **Step 2: Delete old service directories**

```bash
rm -rf src/services/attributeService/
rm -rf src/services/scoringService/
```

- [ ] **Step 3: Verify no remaining imports reference old services**

Run: `grep -r "AttributeService\|ScoringService\|attributeService\|scoringService" src/ --include="*.ts" 2>&1`
Expected: No results (or only in comments/strings, not imports)

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ src/services/serviceRegistry.ts
git commit -m "refactor: delete AttributeService and ScoringService, replaced by MapService, DefineService, MatchService"
```
