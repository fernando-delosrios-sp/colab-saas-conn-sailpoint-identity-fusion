## Why

Dictionary-shaped form inputs in `formProcessor.ts` are parsed with `Object.values(dict).find(...)`, which allocates an array of every input object and scans linearly for each field extraction (account, name, source, candidates, correlated identity id). Form decision processing reads multiple fields per answered instance, so the repeated allocation and scan adds avoidable overhead on a warm path with no behavior benefit.

## What Changes

**Correlated identity extraction in `readCorrelatedIdentityId`**
- From: `Object.values(dict).find(x => x?.id === FusionAttribute.IdentityId ...)`
- To: Direct lookup on `dict[FusionAttribute.IdentityId]`, then `for...in` fallback when keys are not field-aligned
- Reason: O(1) lookup when keys match field ids; no values-array allocation
- Impact: Non-breaking; identical extracted identity id

**Account info extraction in `extractAccountInfoFromFormInput`**
- From: Three separate `Object.values(formInputs).find(...)` calls for `account`, `name`, and `source`
- To: Direct key lookup per field with `for...in` fallback
- Reason: Eliminate triple allocation/scan on dictionary path
- Impact: Non-breaking; identical account info objects

**Candidate extraction in `extractCandidateIdsFromFormInput`**
- From: `Object.values(formInputs).find(x => x?.id === 'candidates' ...)`
- To: Direct lookup on `dict['candidates']`, then `for...in` fallback
- Reason: Same optimization pattern as other extractors
- Impact: Non-breaking; identical candidate id lists

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `form-service`: Document dictionary form-input field resolution invariants (direct key lookup, fallback scan, flat/dictionary parity)

## Impact

- **Code:** `src/services/formService/formProcessor.ts` (`readCorrelatedIdentityId`, `extractAccountInfoFromFormInput`, `extractCandidateIdsFromFormInput`)
- **Tests:** Existing `formProcessor.test.ts` must pass unchanged
- **Operations:** Reduced allocation during form decision processing; no config or deployment changes
- **Dependencies:** None
