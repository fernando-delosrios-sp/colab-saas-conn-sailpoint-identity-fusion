# Collapse the FusionAccount facade into behavior-rich objects

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the ~70-method FusionAccount facade, 8 rule modules, and FusionAccountState into three behavior-rich sub-objects (FusionCollections, FusionCorrelation, FusionLayers) with private state.

**Architecture:** FusionAccount becomes a ~150-line top-level class that holds basic info and three readonly sub-objects. Each sub-object owns its slice of state as private fields and exposes domain-level methods. The 9 old files (FusionAccountState + 8 rule modules) are deleted. FusionAccountMatcher is inlined into FusionLayers private methods. ~20 caller files migrate from flat `fusionAccount.method()` calls to `fusionAccount.collections.*` / `fusionAccount.correlation.*` / `fusionAccount.layers.*` access.

---

## Global Constraints

- Prettier config: `printWidth: 120`, `tabWidth: 4`, `semi: false`, `singleQuote: true`.
- No behavioral changes. Every existing test must pass (some assertions updated for new API).
- Config injection: pass explicitly to constructors, not via static global.
- Verify with `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, and `npx vitest run` after every task.
- Create new files before deleting old ones. Callers migrate before old files are deleted.
- Do NOT change any logic in rule function bodies when moving them — copy verbatim, then update `this.state.*` to private field access.

---

## Out-of-scope file list

These files are referenced but their internals must not be changed (only call-site updates):
- `src/services/fusionService/fusionService.ts` — call-site updates only
- `src/services/fusionService/helpers.ts` — call-site updates only (no new variable names unless remapping is necessary as part of the FusionAccount refactor)
- `src/services/formService/formService.ts`, `formBuilder.ts`, `helpers.ts` — call-site updates only
- `src/services/correlationManager.ts` — call-site updates only
- `src/services/matchingService/` — call-site updates only
- `src/operations/actions/*.ts` — call-site updates only
- `src/operations/helpers/*.ts` — call-site updates only
- `src/model/fusionAccountUtils.ts` — no changes
- `src/model/fusionAccountTypes.ts` — remove `FusionAccountState` export only; otherwise no changes

---

## Task 1: Create FusionCollections sub-object

Create `src/model/fusionCollections.ts` with all collection state as private fields and domain-level methods inlined from rule modules.

- [ ] **Step 1.1: Declare private state fields**
  ```typescript
  private _accountIds = new Set<string>()
  private _missingAccountIds = new Set<string>()
  private _statuses = new Set<string>()
  private _actions = new Set<string>()
  private _reviews = new Set<string>()
  private _sources = new Set<string>()
  private _fusionMatches: FusionMatch[] = []
  private _history: string[] = []
  private _previousAccountIds = new Set<string>()
  private _managedAccountInfo = new Map<string, FusionManagedAccountInfo>()
  private _pendingReviewUrls = new Set<string>()
  private _reviewPromises: Array<Promise<string | undefined>> = []
  ```

- [ ] **Step 1.2: Constructor accepts config** — `maxHistoryMessages` from `FusionConfig` for history truncation.
  ```typescript
  constructor(private readonly maxHistoryMessages: number) {}
  ```

- [ ] **Step 1.3: Inline collectionRules.ts bodies** — Copy the bodies of `addAccountId`, `removeAccountId`, `addMissingAccountId`, `removeMissingAccountId`, `addSource`, `removeSource`, `getMissingAccountIdsForSource`, `removeSourceAccount` verbatim. Replace `state.<field>` with `this._<field>`. Replace `addHistory(state, msg)` with `this._addHistory(msg)`. Replace `addToSet`/`removeFromSet` helper calls with direct Set operations + `this._addHistory(msg)` when a message is provided. Organize into namespaced groups:
  ```typescript
  readonly accounts = {
      add: (id: string, message?: string) => { ... },
      remove: (id: string, message?: string) => { ... },
      addMissing: (id: string, message?: string) => { ... },
      removeMissing: (id: string, message?: string) => { ... },
      getMissingForSource: (sourceName: string): string[] => { ... },
      removeSourceAccount: (id: string) => { ... },
  }
  readonly sources = {
      add: (source: string, message?: string) => { ... },
      remove: (source: string, message?: string) => { ... },
  }
  ```

- [ ] **Step 1.4: Inline statusRules.ts bodies** — Copy `addStatus`, `removeStatus`, `hasStatus`, `setNonMatched`, `setUncorrelatedAccount`, `isOrphan`, `setManual`, `setAuthorized`, `setBaseline`, `markAsOrphan`, `createDecisionHistoryMessage`, `formatHistoryAccountInfo`, `normalizeHistoryLabel` verbatim. Organize into:
  ```typescript
  readonly statuses = {
      add: (status: string, message?: string) => { ... },
      remove: (status: string, message?: string) => { ... },
      has: (status: string): boolean => { ... },
      setNonMatched: () => { ... },
      setUncorrelatedAccount: (accountId: string) => { ... },
      isOrphan: (originSource?: string, originAccount?: string, originIdentityInScope?: boolean): boolean => { ... },
  }
  ```

- [ ] **Step 1.5: Inline actionRules.ts bodies** — Copy `addAction`, `removeAction`, `addFusionDecision`, `setSourceReviewer`, `removeSourceReviewer`, `listReviewerSources` verbatim. Organize into:
  ```typescript
  readonly actions = {
      add: (action: string, message?: string) => { ... },
      remove: (action: string, message?: string) => { ... },
      addFusionDecision: (decision: string) => { ... },
      setSourceReviewer: (sourceId: string) => { ... },
      removeSourceReviewer: (sourceId: string) => { ... },
      listReviewerSources: (): string[] => { ... },
  }
  ```

- [ ] **Step 1.6: Inline reviewRules.ts bodies** — Copy `addReview`, `removeReview`, `addFusionReview`, `removeFusionReview`, `clearFusionReviews`, `addPendingReviewUrl`, `addReviewPromise` verbatim. Organize into:
  ```typescript
  readonly reviews = {
      add: (review: string, message?: string) => { ... },
      remove: (review: string, message?: string) => { ... },
      addFusionReview: (url: string) => { ... },
      removeFusionReview: (url: string) => { ... },
      clearFusionReviews: () => { ... },
      addPendingUrl: (url: string) => { ... },
      addPromise: (promise: Promise<string | undefined>) => { ... },
  }
  ```

- [ ] **Step 1.7: Inline historyRules.ts bodies** — Create a private `_addHistory(message: string)` method (inline `addHistory` body). Expose `importHistory` as `history.importFromArray(arr: string[])`. Expose `formatHistoryAccountInfo` and `normalizeHistoryLabel` as private helpers.

- [ ] **Step 1.8: Inline match management** — Add `matches.add(match: FusionMatch)` and `matches.clearRefs()`. Inline `addFusionMatch` and `clearFusionIdentityReferences` bodies from `fusionAccountRules/layerRules.ts`.

- [ ] **Step 1.9: Inline `syncToBag`** — Copy `syncCollectionAttributesToBag` from `FusionAccountState`. Replace `bag[FusionAttribute.X]` references with equivalent write operations. Accept bag parameter.

- [ ] **Step 1.10: Expose read-only getters**
  ```typescript
  get accountIds(): ReadonlySet<string> { return this._accountIds }
  get missingAccountIds(): ReadonlySet<string> { return this._missingAccountIds }
  get statuses(): ReadonlySet<string> { return this._statuses }
  get actions(): ReadonlySet<string> { return this._actions }
  get reviews(): ReadonlySet<string> { return this._reviews }
  get sources(): ReadonlySet<string> { return this._sources }
  get fusionMatches(): readonly FusionMatch[] { return this._fusionMatches }
  get history(): readonly string[] { return this._history }
  get managedAccountInfo(): ReadonlyMap<string, FusionManagedAccountInfo> { return this._managedAccountInfo }
  get pendingReviewUrls(): ReadonlySet<string> { return this._pendingReviewUrls }
  get reviewPromises(): readonly Promise<string | undefined>[] { return this._reviewPromises }
  get previousAccountIds(): ReadonlySet<string> { return this._previousAccountIds }
  ```

- [ ] **Step 1.11: Verify** — `npx tsc --noEmit` (FusionCollections compiles in isolation; create a temporary test or check with `--project tsconfig.json` scoped to the file and its imports)

---

## Task 2: Create FusionCorrelation sub-object

Create `src/model/fusionCorrelation.ts` with correlation state as private fields.

- [ ] **Step 2.1: Declare private state**
  ```typescript
  private _correlationPromises: Array<Promise<unknown>> = []
  ```

- [ ] **Step 2.2: Constructor injection** — Receives `FusionCollections` reference for cross-object mutations.
  ```typescript
  constructor(private readonly collections: FusionCollections) {}
  ```

- [ ] **Step 2.3: Inline correlationRules.ts bodies**
  - `addPromise(accountId: string, promise: Promise<unknown>)` — push to `_correlationPromises`
  - `updateStatus()` — inline `updateCorrelationStatus` body. Replace `state.accountIds`, `state.missingAccountIds`, `state.actions`, `state.statuses` with `this.collections.<getter>`. Replace `addAction(state, ...)` with `this.collections.actions.add(...)` etc.

- [ ] **Step 2.4: Inline promise resolution logic**
  - `resolvePendingOperations(awaitCorrelations: boolean = true)` — inline `resolvePendingOperations` from reviewRules.ts. Resolve review promises via `this.collections.reviewPromises`, resolve correlation promises via `this._correlationPromises`. Call `this.collections.reviews.addFusionReview(url)` for each resolved review.
  - `resolvePendingReviewUrls()` — inline from reviewRules.ts. Copy pending URLs to active fusion reviews via `this.collections.reviews.*`.

- [ ] **Step 2.5: Expose read-only getter**
  ```typescript
  get promises(): readonly Promise<unknown>[] { return this._correlationPromises }
  ```

- [ ] **Step 2.6: Verify** — `npx tsc --noEmit` (FusionCorrelation compiles)

---

## Task 3: Create FusionLayers sub-object

Create `src/model/fusionLayers.ts` with layer methods and layer-owned state.

- [ ] **Step 3.1: Declare private state**
  ```typescript
  private _needsRefresh = false
  private _needsReset = false
  private _isIdentity = false
  private _isMatch = false
  private _disabled = false
  private _uncorrelated = false
  private _originSource?: string
  private _originAccount?: string
  private _originIdentityInScope?: boolean
  ```

- [ ] **Step 3.2: Constructor injection**
  ```typescript
  constructor(
      private readonly collections: FusionCollections,
      private readonly correlation: FusionCorrelation,
      private readonly sourceConfigNamesSet: ReadonlySet<string>,
      private readonly fusionAccountRefreshThresholdInSeconds: number
  ) {}
  ```

- [ ] **Step 3.3: Inline layerRules.ts `addIdentityLayer` body** — Copy verbatim. Replace `state.email` with direct setter access (FusionAccount will pass value). Replace `state.identityInfo` with accessor on FusionAccount. Replace `state.attributeBag.identity` with accessor. Replace `state.isIdentity` with `this._isIdentity = true`. Replace `state.needsRefresh` with `this._needsRefresh`. Replace `state.sourceConfigNamesSet` with `this.sourceConfigNamesSet`. Replace account correlation calls with `this.collections.accounts.add(...)` and `this.collections.accounts.removeMissing(...)`.

- [ ] **Step 3.4: Inline layerRules.ts `addManagedAccountLayer` body** — Copy verbatim. Replace all `state.*` collection access with `this.collections.*` calls. Replace `state.previousAccountIds` assignment with `this.collections` field access (add a setter or pass state differently — see note below).

  **Note on previousAccountIds mutation:** The managed account layer normalizes `state.previousAccountIds` via `normalizeManagedAccountKeySet`. This mutates a collection field that lives on `FusionCollections`. Solution: add a package-private `_setPreviousAccountIds(ids: Set<string>)` method on `FusionCollections` OR make `FusionLayers` directly set the private field via a trusted method. Since both classes are in the same package, use a `/** @internal */` setter on `FusionCollections`:
  ```typescript
  /** @internal — only for FusionLayers */
  _normalizePreviousAccountIds(normalizer: (ids: Set<string>) => Set<string>): void { ... }
  ```

- [ ] **Step 3.5: Inline layerRules.ts `addFusionDecisionLayer` body** — Copy verbatim. Replace `state.*` with appropriate collection/correlation calls.

- [ ] **Step 3.6: Inline layerRules.ts remaining exports** — Copy `addFusionMatch` (→ call `this.collections.matches.add(match)`), `clearFusionIdentityReferences` (→ call `this.collections.matches.clearRefs()`), `setManagedAccount` private method.

- [ ] **Step 3.7: Inline fusionAccountMatcher.ts** — Copy the 4 exported functions (`processIdentityMatchedAccounts`, `processPreviousRunMatchedAccounts`, `preserveMissingAccountContext`, `pruneDeletedManagedAccounts`) as private methods on `FusionLayers`. Replace `state.*` access with `this.collections.*` calls. Replace `addAccountId(state, id)` with `this.collections.accounts.add(id)` etc.

- [ ] **Step 3.8: Expose public layer methods and accessors**
  ```typescript
  addIdentityLayer(identity: IdentityDocument, attributeBag: FusionAttributeBag, modified?: string): void { ... }
  addManagedAccountLayer(workQueue: FusionRun, allAccountsById?: Map<string, Account>, options?: AddManagedAccountOptions): void { ... }
  addFusionDecisionLayer(decision: FusionDecision): void { ... }

  get needsRefresh(): boolean { return this._needsRefresh }
  get needsReset(): boolean { return this._needsReset }
  get isIdentity(): boolean { return this._isIdentity }
  get isMatch(): boolean { return this._isMatch }
  get disabled(): boolean { return this._disabled }
  get uncorrelated(): boolean { return this._uncorrelated }
  get originSource(): string | undefined { return this._originSource }
  get originAccount(): string | undefined { return this._originAccount }
  get originIdentityInScope(): boolean | undefined { return this._originIdentityInScope }

  set needsRefresh(v: boolean) { this._needsRefresh = v }
  set needsReset(v: boolean) { this._needsReset = v }
  set disabled(v: boolean) { this._disabled = v }
  set originIdentityInScope(v: boolean) { this._originIdentityInScope = v }
  ```

- [ ] **Step 3.9: Verify** — `npx tsc --noEmit` (FusionLayers compiles)

---

## Task 4: Rewrite FusionAccount as the top-level class

Rewrite `src/model/fusionAccount.ts` (currently a re-export barrel) as the real class.

- [ ] **Step 4.1: Declare class and private state**
  ```typescript
  export class FusionAccount {
      private static _config?: FusionConfig
      private _key?: SimpleKeyType
      private _managedKey?: string
      private _iscAccountId?: string
      private _email?: string
      private _name?: string
      private _sourceName = ''
      private _type: FusionAccountKind = FusionAccountKind.Fusion
      private _modified?: string
      private _attributeBag: FusionAttributeBag = { previous: {}, current: {}, identity: {}, sourceAccountContexts: [], sources: new Map() }
      private _sourceAttributeMapCache?: Map<string, Attributes[]>

      readonly collections: FusionCollections
      readonly correlation: FusionCorrelation
      readonly layers: FusionLayers
  ```

- [ ] **Step 4.2: Constructor**
  ```typescript
  private constructor(config: FusionConfig) {
      this.collections = new FusionCollections(config.maxHistoryMessages)
      this.correlation = new FusionCorrelation(this.collections)
      this.layers = new FusionLayers(
          this.collections,
          this.correlation,
          new Set(config.sources.map(sc => sc.name)),
          config.fusionAccountRefreshThresholdInSeconds
      )
  }
  ```

- [ ] **Step 4.3: configure() and factory methods**
  ```typescript
  static configure(config: FusionConfig): void { FusionAccount._config = config }

  static fromFusionAccount(account: Account): FusionAccount {
      const fa = new FusionAccount(this.ensureConfig())
      // ... rest of fromFusionAccount logic (from constructionRules.ts, inlined)
      return fa
  }
  // Same for fromIdentity, fromManagedAccount, fromFusionDecision
  ```

  Inline the construction logic from `constructionRules.ts` directly into the factory methods. These are constructor-time-only operations that set initial state. Since the target is ~150 lines for FusionAccount, keep the factory bodies concise — delegate complex initialization to private helper methods on FusionAccount.

- [ ] **Step 4.4: Basic accessors**
  ```typescript
  get key(): SimpleKeyType | undefined { return this._key }
  setKey(key: SimpleKeyType): void { this._key = key }

  get managedKey(): string | undefined { return this._managedKey }
  get managedKeyOrUndefined(): string | undefined { return this._managedKey }
  // managedKeyOrUndefined is an alias — keep for backward compat
  get managedAccountId(): string | undefined { return this._managedKey }
  get iscAccountId(): string | undefined { return this._iscAccountId }

  get email(): string | undefined { return this._email }
  setEmail(email: string | undefined): void { this._email = email }

  get name(): string | undefined { return this._name }
  setName(name: string | undefined): void { this._name = name }

  get displayName(): string | undefined { return this._name }
  setDisplayName(name: string | undefined): void { this._name = name }

  get sourceName(): string { return this._sourceName }
  setSourceName(name: string): void { this._sourceName = name }

  get type(): FusionAccountKind { return this._type }
  set type(t: FusionAccountKind) { this._type = t }

  get modified(): string | undefined { return this._modified }
  ```

- [ ] **Step 4.5: Layer method pass-throughs**
  ```typescript
  addIdentityLayer(identity: IdentityDocument): void {
      this.layers.addIdentityLayer(identity, this._attributeBag, this._modified)
  }
  addManagedAccountLayer(workQueue: FusionRun, allAccountsById?: Map<string, Account>, options?: AddManagedAccountOptions): void {
      this.layers.addManagedAccountLayer(workQueue, allAccountsById, options)
  }
  addFusionDecisionLayer(decision: FusionDecision): void {
      this.layers.addFusionDecisionLayer(decision)
  }
  ```

- [ ] **Step 4.6: Lifecycle methods** — Delegate to `this.layers`:
  ```typescript
  get disabled(): boolean { return this.layers.disabled }
  enable(): void { this.layers.disabled = false }
  disable(): void { this.layers.disabled = true }
  get needsRefresh(): boolean { return this.layers.needsRefresh }
  get needsReset(): boolean { return this.layers.needsReset }
  setNeedsRefresh(v: boolean): void { this.layers.needsRefresh = v }
  setNeedsReset(v: boolean): void { this.layers.needsReset = v }
  setNonMatched(): void { this.collections.statuses.setNonMatched() }
  ```

- [ ] **Step 4.7: Attribute accessors**
  ```typescript
  getAttribute(name: string): Attributes[string] | undefined { return this._attributeBag.current[name] }
  getStringAttribute(name: string): string | undefined { const v = this.getAttribute(name); return typeof v === 'string' ? v : undefined }
  hasAttribute(name: string): boolean { return name in this._attributeBag.current }
  get attributeBag(): FusionAttributeBag { return this._attributeBag }
  get currentAttributes(): Attributes { return this._attributeBag.current }
  get previousAttributes(): Attributes { return this._attributeBag.previous }
  get sourceAttributeMap(): Map<string, Attributes[]> | undefined { return this._sourceAttributeMapCache }
  setMappedAttributes(attrs: Attributes): void { this._attributeBag.current = attrs }
  ```

- [ ] **Step 4.8: toISCAccount() and sync**
  ```typescript
  toISCAccount(): Account {
      return {
          attributes: this._attributeBag.current,
          disabled: this.layers.disabled,
          key: this._key,
      } as Account
  }
  syncCollectionAttributesToBag(): void {
      this.collections.syncToBag(this._attributeBag.current)
  }
  ```

- [ ] **Step 4.9: Reverse correlation helpers** — Delegate to `this.collections`:
  ```typescript
  getManagedAccountInfo(accountId: string): FusionManagedAccountInfo | undefined { return this.collections.managedAccountInfo.get(accountId) }
  setManagedAccountInfo(accountId: string, sourceName: string, nativeIdentity: string): void { ... }
  getMissingAccountIdsForSource(sourceName: string): string[] { return this.collections.accounts.getMissingForSource(sourceName) }
  setReverseCorrelationAttribute(name: string, value: string): void { this._attributeBag.current[name] = value }
  clearReverseCorrelationAttribute(name: string): void { delete this._attributeBag.current[name] }
  ```

- [ ] **Step 4.10: Identity accessors** — Inline from current getters, reading from `_attributeBag.identity` or `FusionAccountState.identityInfo` equivalent location on the attribute bag.

- [ ] **Step 4.11: Update barrel exports**
  - Update `src/model/account.ts` to re-export from `./fusionAccount` (no change needed if path is the same; confirm exports match)
  - Update `src/model/fusionAccount.ts` to export `FusionAccount` directly and `IDENTITIES_SOURCE_NAME` from construction rules (or move the constant)

- [ ] **Step 4.12: Verify** — `npx tsc --noEmit`

---

## Task 5: Delete old files

- [ ] **Step 5.1: Delete `src/model/fusionAccountState.ts`**
- [ ] **Step 5.2: Delete `src/model/fusionAccountRules/` directory** (all 8 files)
- [ ] **Step 5.3: Delete `src/model/fusionAccountAccessors.ts`** (FusionAccount subclass extending FusionAccountBase — no longer exists)
- [ ] **Step 5.4: Delete `src/model/fusionAccountBase.ts`** (the old facade — replaced by new `fusionAccount.ts`)
- [ ] **Step 5.5: Delete `src/model/fusionAccountMatcher.ts`** (logic inlined into FusionLayers)
- [ ] **Step 5.6: Update `src/model/fusionAccountTypes.ts`** — remove `FusionAccountState` export; remove any type imports from deleted rule modules
- [ ] **Step 5.7: Run `npx knip`** — confirm no dead imports reference deleted files
- [ ] **Step 5.8: Verify** — `npx tsc --noEmit`, `npx eslint "src/model/**/*.ts"`

---

## Task 6: Update callers — services

Update all call sites in `src/services/` to use new sub-object API.

- [ ] **Step 6.1: FusionService (`src/services/fusionService/fusionService.ts`)**
  - Replace `fusionAccount.addAccountId(id, msg)` → `fusionAccount.collections.accounts.add(id, msg)`
  - Replace `fusionAccount.removeAccountId(id, msg)` → `fusionAccount.collections.accounts.remove(id, msg)`
  - Replace `fusionAccount.addMissingAccountId(id, msg)` → `fusionAccount.collections.accounts.addMissing(id, msg)`
  - Replace `fusionAccount.removeMissingAccountId(id)` → `fusionAccount.collections.accounts.removeMissing(id)`
  - Replace `fusionAccount.addStatus(s, msg)` → `fusionAccount.collections.statuses.add(s, msg)`
  - Replace `fusionAccount.removeStatus(s, msg)` → `fusionAccount.collections.statuses.remove(s, msg)`
  - Replace `fusionAccount.hasStatus(s)` → `fusionAccount.collections.statuses.has(s)`
  - Replace `fusionAccount.addAction(a, msg)` → `fusionAccount.collections.actions.add(a, msg)`
  - Replace `fusionAccount.removeAction(a, msg)` → `fusionAccount.collections.actions.remove(a, msg)`
  - Replace `fusionAccount.addReview(r, msg)` → `fusionAccount.collections.reviews.add(r, msg)`
  - Replace `fusionAccount.removeReview(r, msg)` → `fusionAccount.collections.reviews.remove(r, msg)`
  - Replace `fusionAccount.addSource(s, msg)` → `fusionAccount.collections.sources.add(s, msg)`
  - Replace `fusionAccount.removeSource(s, msg)` → `fusionAccount.collections.sources.remove(s, msg)`
  - Replace `fusionAccount.addFusionMatch(m)` → `fusionAccount.collections.matches.add(m)`
  - Replace `fusionAccount.updateCorrelationStatus()` → `fusionAccount.correlation.updateStatus()`
  - Replace `fusionAccount.setCorrelatedAccount(id, p)` → combination of `fusionAccount.collections.accounts.add(id)` + `fusionAccount.collections.accounts.removeMissing(id)` + `fusionAccount.correlation.addPromise(id, p)`
  - Replace `fusionAccount.addCorrelationPromise(id, p)` → `fusionAccount.correlation.addPromise(id, p)`
  - Replace `fusionAccount.resolvePendingOperations(await)` → `fusionAccount.correlation.resolvePendingOperations(await)`
  - Replace `fusionAccount.addPendingReviewUrl(url)` → `fusionAccount.collections.reviews.addPendingUrl(url)`
  - Replace `fusionAccount.resolvePendingReviewUrls()` → `fusionAccount.correlation.resolvePendingReviewUrls()`
  - Replace `fusionAccount.addReviewPromise(p)` → `fusionAccount.collections.reviews.addPromise(p)`
  - Replace `fusionAccount.addFusionReview(url)` → `fusionAccount.collections.reviews.addFusionReview(url)`
  - Replace `fusionAccount.removeFusionReview(url)` → `fusionAccount.collections.reviews.removeFusionReview(url)`
  - Replace `fusionAccount.clearFusionReviews()` → `fusionAccount.collections.reviews.clearFusionReviews()`
  - Replace `fusionAccount.addFusionDecision(d)` → `fusionAccount.collections.actions.addFusionDecision(d)`
  - Replace `fusionAccount.importHistory(h)` → `fusionAccount.collections.history.importFromArray(h)`
  - Replace `fusionAccount.setSourceReviewer(s)` → `fusionAccount.collections.actions.setSourceReviewer(s)`
  - Replace `fusionAccount.removeSourceReviewer(s)` → `fusionAccount.collections.actions.removeSourceReviewer(s)`
  - Replace `fusionAccount.listReviewerSources()` → `fusionAccount.collections.actions.listReviewerSources()`
  - Replace `fusionAccount.removeSourceAccount(id)` → `fusionAccount.collections.accounts.removeSourceAccount(id)`
  - Replace `fusionAccount.isOrphan()` → `fusionAccount.collections.statuses.isOrphan(fusionAccount.layers.originSource, fusionAccount.layers.originAccount, fusionAccount.layers.originIdentityInScope)`
  - Replace `fusionAccount.accountIds` → `fusionAccount.collections.accountIds`
  - Replace `fusionAccount.missingAccountIds` → `fusionAccount.collections.missingAccountIds`
  - Replace `fusionAccount.accountIdsSet` → `fusionAccount.collections.accountIds`
  - Replace `fusionAccount.missingAccountIdsSet` → `fusionAccount.collections.missingAccountIds`
  - Replace `fusionAccount.statuses` → `fusionAccount.collections.statuses`
  - Replace `fusionAccount.actions` → `fusionAccount.collections.actions`
  - Replace `fusionAccount.reviews` → `fusionAccount.collections.reviews`
  - Replace `fusionAccount.sources` → `fusionAccount.collections.sources`
  - Replace `fusionAccount.fusionMatches` → `fusionAccount.collections.fusionMatches`
  - Replace `fusionAccount.history` → `fusionAccount.collections.history`

- [ ] **Step 6.2: FusionService helpers (`src/services/fusionService/helpers.ts`)** — Same migration pattern for all `fusionAccount.*` calls

- [ ] **Step 6.3: CorrelationManager (`src/services/correlationManager.ts`)** — Replace `fusionAccount.missingAccountIds`, `fusionAccount.getManagedAccountInfo`, `fusionAccount.updateCorrelationStatus` with sub-object equivalents

- [ ] **Step 6.4: FormService and helpers** — Replace `fusionAccount.*` calls with sub-object equivalents in `formService.ts`, `formBuilder.ts`, `helpers.ts`

- [ ] **Step 6.5: DefinitionService** — Replace `fusionAccount.*` calls in `definitionService.ts`

- [ ] **Step 6.6: AccountAssembly** — Replace `fusionAccount.*` calls in `accountAssembly.ts`

- [ ] **Step 6.7: MatchingService** — Replace `state.*` field access with sub-object method calls where `FusionAccountState` was previously passed directly

- [ ] **Step 6.8: Verify** — `npx tsc --noEmit` (zero errors in services/)

---

## Task 7: Update callers — operations

- [ ] **Step 7.1: `src/operations/actions/correlateAction.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.2: `src/operations/actions/fusionAction.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.3: `src/operations/actions/reportAction.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.4: `src/operations/actions/reviewerAction.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.5: `src/operations/helpers/corePipeline.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.6: `src/operations/helpers/dryRunHelpers.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.7: `src/operations/helpers/rebuildFusionAccount.ts`** — Migrate `fusionAccount.*` calls
- [ ] **Step 7.8: Verify** — `npx tsc --noEmit` (zero errors in operations/)

---

## Task 8: Update model internal callers

- [ ] **Step 8.1: `src/model/fusionRun.ts`** — Replace any `FusionAccountState` / rule module references
- [ ] **Step 8.2: `src/model/aggregationTracker.ts`** — Replace `FusionAccount.*` calls (if any)
- [ ] **Step 8.3: Verify** — `npx tsc --noEmit`, `npx eslint "src/model/**/*.ts"`

---

## Task 9: Update existing tests

- [ ] **Step 9.1: `src/model/__tests__/fusionAccount.test.ts`** — Replace flat facade calls with sub-object access. Replace `FusionAccountState` references. Replace `as any._*` field access with public getter access. Update assertions to use `fusionAccount.collections.accountIds` instead of `fusionAccount.accountIds`.

- [ ] **Step 9.2: `src/model/__tests__/fusionRun.test.ts`** — Update `FusionAccount` references

- [ ] **Step 9.3: `src/services/fusionService/__tests__/`** — Update test assertions to use sub-object API

- [ ] **Step 9.4: `src/services/formService/__tests__/`** — Update test assertions

- [ ] **Step 9.5: `src/services/definitionService/__tests__/`** — Update test assertions

- [ ] **Step 9.6: `src/services/matchingService/__tests__/`** — Update tests that pass/access `FusionAccountState` directly

- [ ] **Step 9.7: `src/operations/helpers/__tests__/`** — Update test assertions

- [ ] **Step 9.8: Run `npx vitest run`** — Expected all tests pass (some test body changes for API migration, zero behavioral regressions)

---

## Task 10: Add tests for new sub-objects

- [ ] **Step 10.1: Create `src/model/__tests__/fusionCollections.test.ts`**
  - Test all collection operations: account add/remove, status add/remove/has, action add/remove, review add/remove/fusionReview, source add/remove, match add, history import
  - Test `syncToBag` writes all collections correctly
  - Test orphan detection via `statuses.isOrphan()`
  - Test `getMissingForSource` filtering

- [ ] **Step 10.2: Create `src/model/__tests__/fusionCorrelation.test.ts`**
  - Test promise tracking
  - Test `updateStatus` with various collection states
  - Test `resolvePendingOperations` resolves both review and correlation promises
  - Test `resolvePendingReviewUrls` copies to active reviews

- [ ] **Step 10.3: Create `src/model/__tests__/fusionLayers.test.ts`**
  - Test `addIdentityLayer` with mock identity — verifies state changes on collections
  - Test `addManagedAccountLayer` with mock work queue — verifies account claiming and collection updates
  - Test `addFusionDecisionLayer` with manual and authorized decisions

- [ ] **Step 10.4: Run new tests** — `npx vitest run src/model/__tests__/fusionCollections.test.ts src/model/__tests__/fusionCorrelation.test.ts src/model/__tests__/fusionLayers.test.ts` — all pass

---

## Task 11: Final verification

- [ ] **Step 11.1: Full typecheck** — `npx tsc --noEmit` — zero errors
- [ ] **Step 11.2: Full lint** — `npx eslint "src/**/*.ts"` — zero errors, zero warnings
- [ ] **Step 11.3: Dead code check** — `npx knip` — no unused exports or dead files
- [ ] **Step 11.4: Full test suite** — `npx vitest run` — all tests pass (expected: 981+ passed, 2 skipped)
- [ ] **Step 11.5: Build** — `npm run build` — compiles to `dist/` without errors
- [ ] **Step 11.6: Line count verification**
  ```bash
  # New files
  wc -l src/model/fusionCollections.ts src/model/fusionCorrelation.ts src/model/fusionLayers.ts src/model/fusionAccount.ts
  # Expected: each under ~400 lines, FusionAccount under ~200 lines
  ```
- [ ] **Step 11.7: Deleted files confirmation**
  ```bash
  # Should NOT exist
  ls src/model/fusionAccountState.ts src/model/fusionAccountBase.ts src/model/fusionAccountAccessors.ts src/model/fusionAccountMatcher.ts src/model/fusionAccountRules/ 2>&1
  # Expected: "No such file or directory" for each
  ```

---

## Final file layout

```
src/model/
  fusionAccount.ts              (~180 lines, top-level class + factories)
  fusionCollections.ts          (~350 lines, all collection ops)
  fusionCorrelation.ts          (~120 lines, correlation state)
  fusionLayers.ts               (~400 lines, 3 layer methods + matchers)
  fusionAccountUtils.ts         (unchanged)
  fusionAccountTypes.ts         (unchanged, minus FusionAccountState export)
  account.ts                    (unchanged, re-exports FusionAccount)
  __tests__/
    fusionAccount.test.ts       (updated for sub-object API)
    fusionCollections.test.ts   (new)
    fusionCorrelation.test.ts   (new)
    fusionLayers.test.ts        (new)
```

---

## Escape Hatches

**STOP and report back if:**
- Any existing test fails for a reason other than API migration (i.e., behavioral regression)
- The circular-dependency concern materializes (FusionLayers ↔ FusionCollections/FusionCorrelation)
- Any caller cannot be migrated without changing its own logic (not just FusionAccount method names)
- TypeScript cannot resolve the sub-object types due to module ordering issues
- The `managedAccountInfo` Map migration breaks `getMissingAccountIdsForSource` behavior
- Line counts exceed targets (FusionAccount > 250 lines, any sub-object > 500 lines)
