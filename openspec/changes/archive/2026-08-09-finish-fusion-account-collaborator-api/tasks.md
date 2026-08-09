## 1. Collaborator hydrate APIs (encapsulation)

- [x] 1.1 Add documented hydrate/seed APIs on `FusionCollections` for restoring statuses, actions, reviews, sources, account/missing sets, and history from persisted attributes (replace `_internal_*` factory usage)
- [x] 1.2 Add documented APIs on `FusionLayers` for setting origin metadata and layer flags used by factories
- [x] 1.3 Refactor `FusionAccount` factories (`fromFusionAccount`, `fromIdentity`, `fromManagedAccount`, `fromFusionDecision`) to use those APIs only — no `_internal_*` from factories (scenario: Factory hydration does not use _internal_ mutators)
- [x] 1.4 Unit-test hydrate paths restore the same collection/flag outcomes as before

## 2. Migrate callers to collaborator API

- [x] 2.1 Migrate `src/services/fusionService/**` production call sites from flat mutators to `collections` / `correlation` / `layers` (scenarios: Status mutation; Identity layer enrichment)
- [x] 2.2 Migrate `src/services/matchingService/**`, `src/services/accountAssembly/**`, `src/services/definitionService/**` (and any other service callers) to collaborator API
- [x] 2.3 Migrate `src/operations/**` production call sites to collaborator API
- [x] 2.4 Migrate model/service/operation tests and harnesses (`ReplayAdapter`, etc.) to collaborator API
- [x] 2.5 Ripgrep for remaining flat methods (`addStatus`, `addIdentityLayer`, `addAction`, `addManagedAccountLayer`, …) outside thin wrappers; fix stragglers

## 3. Thin FusionAccount public surface

- [x] 3.1 Remove flat 1:1 pass-through mutators/accessors now unused after migration (keep identity/bag/factories/`toISCAccount`/configure per design D4) (scenario: Collaborators are present on a new FusionAccount; Status/Identity scenarios)
- [x] 3.2 Confirm `readonly collections`, `correlation`, and `layers` remain the public mutation surface (scenario: Collaborators are present)
- [x] 3.3 Update `src/model/__tests__/fusionAccount.test.ts` (and related) for the thinned API; cover collaborator presence and sync-to-current-bag (scenario: Sync updates current bag)

## 4. Specs and ubiquitous language content (canonical files)

- [x] 4.1 Apply `fusion-service` delta: remove State/rules requirements; ensure ADDED collaborator requirements are reflected when archiving (implementation aligns code to delta now) — living `openspec/specs/fusion-service/spec.md` updated now
- [x] 4.2 Update `openspec/specs/ubiquitous-language/spec.md` Canonical Terms: add Fusion account collaborators section; fix **Fusion account name** (`state.name` → `FusionAccount.name`) (scenarios: glossary FusionCollections/Layers/FusionCorrelation; Fusion account name omits State)
- [x] 4.3 Update `docs/glossary.md` to mirror UL collaborator terms and Fusion account name fix (scenario: Structural correlation disambiguation reflected in glossary wording)

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` passes
- [x] 5.2 `npm run lint` passes — pre-existing failures (`.venv`/site-packages JS linted; `scripts/finalize-chain-artifacts.cjs` `normalized` undef; unrelated script/docs lint). Changed model files pass `eslint`
- [x] 5.3 `npm test` passes (no intentional behavior change) — 1489 passed; 3 pre-existing failures: `recordingStore.tenantIsolation` (unexpected `getter` field) and 2× `finalizeChainArtifacts` (`normalized is not defined`); unrelated to collaborator API

## 6. Documentation

- [x] 6.1 Update README / getting-started for user-visible changes — N/A: internal model API only; no user-facing product behavior change
- [x] 6.2 Update API / connector docs for contract or behavior changes — N/A for ISC host contracts; glossary (`docs/glossary.md`) updated in 4.3
- [x] 6.3 Update inline docs (JSDoc on `FusionAccount` and collaborators describing public collaborator API and business vs FusionCorrelation disambiguation)

## 7. Changelog

- [x] 7.1 Create or update changelog entry (invoke changelog-generator if available) — developer-facing entry in `docs/CHANGELOG.md` and root `CHANGELOG.md`
- [x] 7.2 Confirm entry covers developer-facing model API migration (collaborator API) and docs/spec alignment; note no tenant-facing behavior change
