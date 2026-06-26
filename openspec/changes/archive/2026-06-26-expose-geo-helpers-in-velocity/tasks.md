## 1. Extend the geo-data facade

- [x] 1.1 Add `State.getStateByNameAndCountry(name, countryCode)` to `src/services/attributeService/contextHelpers/geo/geoData.ts`.
  - Delegate to `US.getStateByName()` when `countryCode === 'US'`.
  - Delegate to `UK.getUKRegionByName()` when `countryCode === 'GB'` or `countryCode === 'UK'`.
  - Return `undefined` for unsupported country codes.
- [x] 1.2 Add unit tests for the new facade method in `src/services/attributeService/contextHelpers/geo/__tests__/` (or the existing geo test file if one exists).

## 2. Enhance `Normalize.address`

- [x] 2.1 Update `normalizeAddress` in `src/services/attributeService/contextHelpers/normalize.ts` to accept an optional `countryCode` parameter defaulting to `"US"`.
- [x] 2.2 For the US path, enhance the regex fallback to match full state names in addition to 2-letter codes, using `State.getStateByNameAndCountry`.
- [x] 2.3 Add a UK path to the regex fallback that matches region names/codes using `State.getStateByNameAndCountry` and `State.getStateByCodeAndCountry`.
- [x] 2.4 Ensure unsupported country codes fall back to `address.trim()`.
- [x] 2.5 Add unit tests in `src/services/attributeService/__tests__/formatting.test.ts`:
  - Default US behavior is unchanged.
  - Full US state name is normalized to code.
  - UK region name is normalized to code.
  - Unsupported country returns trimmed original.
  - Empty input returns undefined/empty.

## 3. Extend `AddressParse`

- [x] 3.1 Add `getStateName(code, country)` to `src/services/attributeService/contextHelpers/addressParse.ts`.
  - Use `State.getStateByCodeAndCountry`.
  - Return `state?.name ?? ''`.
  - Support `US`, `GB`, `UK`.
- [x] 3.2 Add `getStateCode(name, country)` to `src/services/attributeService/contextHelpers/addressParse.ts`.
  - Use the new `State.getStateByNameAndCountry`.
  - Return `state?.isoCode ?? ''`.
  - Support `US`, `GB`, `UK`.
- [x] 3.3 Export the new methods on the `AddressParse` object.
- [x] 3.4 Add unit tests in `src/services/attributeService/__tests__/formatting.test.ts`:
  - US code → name.
  - US name → code.
  - UK code → name.
  - UK name → code.
  - Unknown code/name returns empty.
  - Case-insensitive name lookup.

## 4. Update user-facing documentation

- [x] 4.1 Update `docs/guides/define.md`:
  - Document `$Normalize.address(address, country?)` with examples for US and UK.
  - Document `$AddressParse.getStateName(code, country)` and `$AddressParse.getStateCode(name, country)` with examples.
  - Mention supported country codes (`US`, `GB`, `UK`).
- [x] 4.2 Update `connector-spec.json`:
  - Update the Normal Attribute Definitions `sectionHelpMessage` to list the new `$Normalize.address` signature and `$AddressParse` methods.
  - Update the Unique Attribute Definitions `sectionHelpMessage` similarly.
- [x] 4.3 Update `README.md` if it lists helpers:
  - Add the new methods to the Attribute Definition Settings helper reference.

## 5. Verify

- [x] 5.1 Run `npm run lint` and fix any issues.
- [x] 5.2 Run `npm test` and ensure all new and existing tests pass.
- [x] 5.3 Run `node -e "JSON.parse(require('fs').readFileSync('connector-spec.json','utf8'))"` to confirm `connector-spec.json` is valid JSON.
- [x] 5.4 Run `npm run docs:build` (or `docs:prepare`) and confirm documentation builds cleanly.
- [x] 5.5 Run `openspec validate expose-geo-helpers-in-velocity --type change --strict` to confirm the change validates.
