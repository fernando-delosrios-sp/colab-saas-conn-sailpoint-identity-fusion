## ADDED Requirements

### Requirement: Dictionary form-input fields SHALL resolve via direct key lookup with id-aligned fallback

When form input is a dictionary of input definition objects, `readCorrelatedIdentityId`, `extractAccountInfoFromFormInput`, and `extractCandidateIdsFromFormInput` SHALL attempt direct property access on the expected field id (`account`, `name`, `source`, `candidates`, or `FusionAttribute.IdentityId`) before scanning remaining entries. The helpers SHALL NOT use `Object.values()` to materialize inputs for lookup. When direct key access does not yield a matching input object, the helpers SHALL iterate dictionary entries and select the first object whose `id` matches the target field and satisfies the same value/description predicates as the pre-optimization implementation. Flat form-input structures SHALL continue to be handled without regression.

#### Scenario: Flat form input extracts account and candidates unchanged
- **GIVEN** a flat form input `{ account: 'src::nat', name: 'Account One', source: 'HR', candidates: 'uuid-1,uuid-2' }`
- **WHEN** `extractAccountInfoFromFormInput` and `extractCandidateIdsFromFormInput` are called
- **THEN** account info SHALL equal `{ id: 'src::nat', name: 'Account One', sourceName: 'HR' }`
- **AND** candidate ids SHALL equal `['uuid-1', 'uuid-2']`

#### Scenario: Dictionary form input with arbitrary keys resolves by input id
- **GIVEN** a dictionary form input `{ a: { id: 'account', value: 'src::nat' }, b: { id: 'candidates', value: 'id-x,id-y' } }`
- **WHEN** `extractAccountInfoFromFormInput` and `extractCandidateIdsFromFormInput` are called
- **THEN** account info SHALL include `id: 'src::nat'`
- **AND** candidate ids SHALL equal `['id-x', 'id-y']`

#### Scenario: Direct key lookup when dictionary keys match field ids
- **GIVEN** a dictionary form input `{ account: { id: 'account', value: 'src::nat' }, candidates: { id: 'candidates', value: 'only-keyed' } }`
- **WHEN** the extractors run
- **THEN** account id SHALL be `'src::nat'`
- **AND** candidate ids SHALL equal `['only-keyed']`
- **AND** no full values-array allocation SHALL be required for lookup

#### Scenario: Description fallback when value is empty
- **GIVEN** a dictionary form input `{ c: { id: 'candidates', description: 'only-desc' } }`
- **WHEN** `extractCandidateIdsFromFormInput` is called
- **THEN** candidate ids SHALL equal `['only-desc']`

#### Scenario: Correlated identity id from dictionary input
- **GIVEN** a dictionary form input containing an entry whose `id` equals `FusionAttribute.IdentityId` with a non-empty `value` or `description`
- **WHEN** `readCorrelatedIdentityId` is invoked via `createFusionDecision`
- **THEN** the resulting decision SHALL include the correlated identity id string
