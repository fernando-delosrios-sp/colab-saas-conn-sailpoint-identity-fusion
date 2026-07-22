# Hydrate correlated identity aliases — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the Fusion display attribute override to the identity alias (SDK top-level `displayName`) and ensure the correlated identity is hydrated so `addIdentityLayer` populates `identityInfo` before serialization.

**Architecture:** Three coordinated code changes — a new `FusionAccount.identityAlias` accessor, a one-line switch in `applyDisplayAttributeOverrideIfApplicable`, and a new pipeline pass that reuses the existing `IdentityService.hydrateMissingIdentitiesById` to load correlated identities then applies the identity layer to the affected FusionAccounts. The existing lazy `applyDisplayAttributeOverride` inside `getISCAccount` does the override re-evaluation for free.

**Tech Stack:** TypeScript, Node.js, Vitest, markdownlint, ESLint.

---

## Task 1: Add `FusionAccount.identityAlias` accessor

**Files:**

- Modify: `src/model/fusionAccountAccessors.ts` (add getter near `identityName`).
- Test: `src/model/__tests__/fusionAccount.test.ts`.

- [ ] **Step 1:** Open `src/model/fusionAccountAccessors.ts`. Find the `public get identityName(): string | undefined` block. Immediately below it, add:

```ts
/** Authoritative account name of the correlated identity, taken from the SDK top-level `displayName`. */
public get identityAlias(): string | undefined {
    return this.state.identityInfo?.displayName
}
```

- [ ] **Step 2:** In `src/model/__tests__/fusionAccount.test.ts`, add a test inside the existing `describe('FusionAccount')` block (or a new one):

```ts
it('identityAlias returns identityInfo.displayName when set', () => {
    const account = new FusionAccount()
    account.setIdentityId('id-1')
    account.state.identityInfo = { id: 'id-1', name: 'login', displayName: 'Display Name' }
    expect(account.identityAlias).toBe('Display Name')
})

it('identityAlias returns undefined when identityInfo is not set', () => {
    const account = new FusionAccount()
    expect(account.identityAlias).toBeUndefined()
})
```

- [ ] **Step 3:** Run: `npx vitest run src/model/__tests__/fusionAccount.test.ts`
- [ ] **Step 4:** Commit: `git add src/model/fusionAccountAccessors.ts src/model/__tests__/fusionAccount.test.ts && git commit -m "feat(model): add FusionAccount.identityAlias accessor"`

---

## Task 2: Switch display attribute override to consume `identityAlias`

**Files:**

- Modify: `src/services/definitionService/definitionService.ts` (lines 219-225).
- Test: `src/services/definitionService/__tests__/defineService.test.ts`.

- [ ] **Step 1:** Open `src/services/definitionService/definitionService.ts`. Find `applyDisplayAttributeOverrideIfApplicable`. Replace:

```ts
const label = fusionAccount.identityName
if (label) {
    this.log.info(`Setting identity name for attr: ${attributeName} for account: ${fusionAccount.name}`)
    fusionAccount.attributes[attributeName] = label
}
```

with:

```ts
const label = fusionAccount.identityAlias
if (label) {
    this.log.info(`Setting identity alias for attr: ${attributeName} for account: ${fusionAccount.name}`)
    fusionAccount.attributes[attributeName] = label
}
```

Also update the JSDoc above the method to refer to "identity alias" instead of "identity name".

- [ ] **Step 2:** In `src/services/definitionService/__tests__/defineService.test.ts`, find every assertion that expects the display attribute to equal the login (or any `identityName`-like value). Update the fixtures so the test identity has a different `displayName` from its `name`, and assert the display attribute receives the `displayName`. Add a new test:

```ts
it('writes identity alias (displayName) to the display attribute when an identity is linked', () => {
    // Build a FusionAccount with identityInfo populated:
    //   { id: 'id-1', name: 'login', displayName: 'Display Name' }
    // call applyDisplayAttributeOverride
    // expect account.attributes.name === 'Display Name'
})
```

Add a test that the existing short-circuit rules still apply when `identityAlias` is undefined:

```ts
it('leaves the display attribute untouched when no identity alias is available and the account already has a value', () => {
    // FusionAccount with no identityInfo and attributes.name = 'persisted'
    // call applyDisplayAttributeOverride
    // expect account.attributes.name === 'persisted'
})
```

- [ ] **Step 3:** Run: `npx vitest run src/services/definitionService/__tests__/defineService.test.ts`
- [ ] **Step 4:** Commit: `git add src/services/definitionService/definitionService.ts src/services/definitionService/__tests__/defineService.test.ts && git commit -m "feat(definition): write identity alias to Fusion display attribute"`

---

## Task 3: Add correlated-identity hydration pass to the pipeline

**Files:**

- Modify: `src/operations/helpers/corePipeline.ts` (new helper + call site).
- Test: `src/operations/helpers/__tests__/corePipeline.test.ts` (or a new `__tests__` file alongside the new helper).

- [ ] **Step 1:** Open `src/operations/helpers/corePipeline.ts`. Add a new private helper above the existing `fetchPhase` (or wherever fits the file's organization):

```ts
/**

 * Hydrates identities correlated to fetched managed accounts, then applies the
 * identity layer to the corresponding FusionAccounts. The display-attribute
 * override is re-evaluated lazily inside getISCAccount, so we only need to
 * ensure identityInfo is populated before serialization.

 */
async function hydrateCorrelatedManagedAccountIdentities(
    identities: IdentityService,
    run: FusionRun,
    log: LogService
): Promise<void> {
    const distinctIds = new Set<string>()
    for (const account of run.allManagedAccounts ?? []) {
        const id = (account as { identityId?: string }).identityId
        if (id) distinctIds.add(id)
    }
    if (distinctIds.size === 0) return

    await identities.hydrateMissingIdentitiesById(Array.from(distinctIds))

    for (const fusionAccount of run.allFusionAccounts ?? []) {
        if (fusionAccount.state.identityInfo) continue
        const origin = fusionAccount.state.originAccount
        if (!origin) continue
        const identity = run.getIdentity(origin)
        if (!identity || identity.protected) continue
        fusionAccount.addIdentityLayer(identity)
    }
    log.debug(`Hydrated ${distinctIds.size} correlated identities for managed accounts`)
}
```

Note: the exact property accessors depend on the actual `FusionRun` and `FusionAccount` API. The skeleton above is a starting point; the implementer MUST adjust to match the real surface (e.g. `run.managedAccounts` vs `run.allManagedAccounts`, `fusionAccount.state.originAccount` vs `fusionAccount.originAccountId`, etc.) by reading the existing `corePipeline.ts` and the relevant model files first.

- [ ] **Step 2:** Find the call site in `corePipeline.ts` that runs after the managed-source aggregation phase completes and before any `getISCAccount` call (likely in `fetchPhase` or a dedicated phase). Insert a single line: `await hydrateCorrelatedManagedAccountIdentities(identities, run, log)`. Adjust the phase order if needed so the hydration runs after `run.allManagedAccounts` (or the equivalent property) is populated and before the first `getISCAccount` call.

- [ ] **Step 3:** Add a unit test in `src/operations/helpers/__tests__/corePipeline.test.ts` (or create a new `__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts` if the helper is exported):

```ts
describe('hydrateCorrelatedManagedAccountIdentities', () => {
    it('does nothing when no managed accounts have an identityId', async () => {
        // registry.identities.hydrateMissingIdentitiesById not called
        // no fusionAccount.addIdentityLayer calls
    })
    it('hydrates once per distinct identity id even when multiple accounts share an id', async () => {
        // two managed accounts with identityId='id-1'
        // hydrateMissingIdentitiesById called with ['id-1']
    })
    it('applies the identity layer to each FusionAccount with a correlated managed origin', async () => {
        // two managed accounts both correlated to id-1
        // addIdentityLayer called twice
    })
    it('skips protected identities', async () => {
        // identity protected=true
        // addIdentityLayer not called
    })
    it('skips FusionAccounts that already have identityInfo set', async () => {
        // fusionAccount.state.identityInfo already set
        // addIdentityLayer not called for that account
    })
})
```

The implementer MUST match the actual test setup used in the existing `corePipeline.test.ts` (mocked `ServiceRegistry`, real or mocked `FusionRun`).

- [ ] **Step 4:** Run: `npx vitest run src/operations/helpers/__tests__/corePipeline.test.ts`
- [ ] **Step 5:** Commit: `git add src/operations/helpers/corePipeline.ts src/operations/helpers/__tests__/corePipeline.test.ts && git commit -m "feat(pipeline): hydrate correlated identities and apply identity layer"`

---

## Task 4: Add chain-harness integration scenario

**Files:**

- Modify: scenarios directory in the chain harness (path TBD by implementer; look for `src/operations/__tests__/chain/scenarios/` or similar).
- New scenario JSON / fixture.

- [ ] **Step 1:** Locate the chain-harness scenario directory. Read one existing scenario that exercises a managed account correlated to an identity. Use it as a template.
- [ ] **Step 2:** Create a new scenario where the managed account is correlated to an identity whose `displayName` (`Alice Anderson`) differs from the login (`aanderson`). The expected output Fusion account's `attributes[fusionDisplayAttribute]` (usually `attributes.name`) SHALL equal `Alice Anderson`, not `aanderson` and not the source account's name.
- [ ] **Step 3:** If the harness supports multi-managed-account scenarios, add a second scenario with enough managed accounts to force more than one 50-ID hydration chunk, and assert the chunking works.
- [ ] **Step 4:** Run the chain harness: `npm test` (or the specific harness command per the project's README).
- [ ] **Step 5:** Commit: `git add <scenario files> && git commit -m "test(chain): scenario for correlated identity alias in Fusion display attribute"`

---

## Task 5: Verify and archive

- [ ] **Step 1:** Run `npm run lint:markdown` and `npx markdownlint` on any changed docs.
- [ ] **Step 2:** Run `npm run lint` (ESLint + knip). Fix any unused exports introduced by the new helper.
- [ ] **Step 3:** Run `npm test`. All tests must pass.
- [ ] **Step 4:** Mark the change ready for verification: `git add openspec/changes/hydrate-correlated-identity-aliases/tasks.md && git commit -m "chore(openspec): mark tasks complete for identity alias hydration"`
- [ ] **Step 5:** Run `/opsx:verify` to confirm the implementation matches the spec.
- [ ] **Step 6:** Run `/opsx:archive` to close the change.
