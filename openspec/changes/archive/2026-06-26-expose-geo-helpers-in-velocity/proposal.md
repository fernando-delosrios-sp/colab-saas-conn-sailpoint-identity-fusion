## Why

The connector already ships a lightweight US/UK geo-data layer (`src/services/attributeService/contextHelpers/geo/`) that replaced the 17MB `country-state-city` dependency. Only one of those helpers — `State.getStateByCodeAndCountry()` — is actually used today, inside `Normalize.address` and `AddressParse`. The remaining lookup helpers (`getStateByName`, `getCitiesByName`, `getAllStates`, `getUKRegionByName`, `getUKCitiesByName`, `getAllUKRegions`) are exported but dead code, and users configuring attribute definitions have no way to canonicalize state/region identifiers or resolve address components from Velocity expressions.

This change exposes those helpers through the existing `$Normalize` and `$AddressParse` Velocity contexts, giving admins a way to clean up geo identifiers (e.g. `"New York"` → `"NY"`, `"Greater London"` → `"LND"`) and to build address-normalization logic that works for both US and UK data.

## What Changes

1. **Extend the `geoData.ts` unified facade** with name-based state/region lookups so callers don't have to import US/UK modules directly:
   - Add `State.getStateByNameAndCountry(name, countryCode)` returning `{ name, isoCode }`.
   - Existing code paths (`Normalize.address`, `AddressParse`) continue to use the existing `State.getStateByCodeAndCountry()`.

2. **Enhance `$Normalize.address(address, country?)`** with an optional country parameter:
   - Defaults to `"US"` to preserve existing behavior when the parameter is omitted.
   - For `"US"`, the regex fallback now recognizes full state names (e.g. `"Washington"`, `"California"`) via `getStateByName()` and normalizes them to ISO codes.
   - For `"GB"` / `"UK"`, the fallback recognizes UK region names and codes via `getUKRegionByName()` / `getUKRegionByCode()` and formats addresses consistently.
   - City data is used only for validation, not for ambiguous city→state inference.

3. **Add explicit geo lookups to `$AddressParse`**:
   - `$AddressParse.getStateName(code, country)` — code → full name.
   - `$AddressParse.getStateCode(name, country)` — name → code.
   - Both methods support `"US"`, `"GB"`, and `"UK"` via the unified `geoData.ts` facade.
   - Existing `$AddressParse.getCityState()` and `$AddressParse.getCityStateCode()` remain deprecated and unchanged.

4. **Update documentation surfaces**:
   - `docs/guides/define.md` — document `$Normalize.address(address, country?)` and the new `$AddressParse` lookup methods.
   - `connector-spec.json` — update the Normal and Unique Attribute Definitions `sectionHelpMessage` to list the new helpers.
   - Update the `attribute-definition-documentation` spec to require accurate documentation of the new methods.

5. **Add unit tests** in `src/services/attributeService/__tests__/formatting.test.ts` covering:
   - `$Normalize.address` with explicit country for US and UK.
   - Full-state-name normalization in US addresses.
   - UK region name/code normalization.
   - `$AddressParse.getStateName` / `getStateCode` for US and UK.

## Capabilities

### New Capabilities
- `velocity-geo-helpers`: Defines the behavior of geo lookup helpers exposed to Velocity — `$Normalize.address(address, country?)` and the new `$AddressParse.getStateName` / `$AddressParse.getStateCode` methods. Covers supported country codes, input matching rules, return values for hits/misses, and the prohibition against ambiguous city→state inference.

### Modified Capabilities
- `attribute-definition-documentation`: Update requirements so that all three documentation surfaces (`connector-spec.json`, `README.md`, `docs/guides/define.md`) accurately list the new `$Normalize.address` signature and the new `$AddressParse` lookup methods alongside the existing helpers.

## Impact

- `src/services/attributeService/contextHelpers/geo/geoData.ts` — new facade method.
- `src/services/attributeService/contextHelpers/normalize.ts` — new optional `country` parameter for `Normalize.address` and enhanced fallback logic.
- `src/services/attributeService/contextHelpers/addressParse.ts` — new `getStateName` / `getStateCode` methods.
- `src/services/attributeService/contextHelpers/index.ts` — no change to exported helper object shape; `AddressParse` and `Normalize` already exported.
- `connector-spec.json` — updated help text only; no schema changes.
- `docs/guides/define.md` — new helper documentation.
- `README.md` — optional quick-reference update if it lists helpers.
- `src/services/attributeService/__tests__/formatting.test.ts` — new test cases.
- No database migrations, no external API changes, no changes to existing Velocity helper signatures other than the additive optional parameter on `$Normalize.address`.
