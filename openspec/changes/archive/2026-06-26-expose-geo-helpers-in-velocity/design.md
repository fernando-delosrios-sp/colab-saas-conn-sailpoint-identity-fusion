## Context

The connector’s attribute-definition pipeline lets administrators write Apache Velocity expressions to compute account attributes. A set of context helpers (`$Normalize`, `$AddressParse`, `$Datefns`, `$Math`, `$JSON`) is injected into the Velocity render context by `evaluateVelocityTemplate()` in `src/services/attributeService/formatting.ts`.

The geo-data layer under `src/services/attributeService/contextHelpers/geo/` provides lightweight US and UK lookups. It was introduced to replace the 17MB `country-state-city` dependency, but only the code-based state lookup (`State.getStateByCodeAndCountry`) is wired into the running helpers. The name-based and enumeration helpers are exported but unused.

This design exposes those unused helpers through two existing Velocity surfaces:

1. **`$Normalize.address(address, country?)`** — automatic address canonicalization.
2. **`$AddressParse.getStateName(code, country)`** and **`$AddressParse.getStateCode(name, country)`** — explicit geo lookups.

See `geo-helpers-c4.drawio` for a container-level view of how the new helpers fit into the existing architecture.

## Goals / Non-Goals

**Goals:**
- Make the existing lightweight geo-data helpers useful from Velocity templates.
- Let admins canonicalize US state and UK region identifiers in attribute definitions.
- Support both automatic normalization (`Normalize.address`) and explicit lookups (`AddressParse`).
- Keep the change additive: existing templates without a country parameter must behave the same.
- Update all user-facing documentation surfaces to reflect the new helpers.
- Add unit tests covering US and UK paths.

**Non-Goals:**
- No new top-level Velocity helper (e.g. `$Geo`). The helpers live under existing `$Normalize` and `$AddressParse` namespaces.
- No city→state inference without disambiguation. The deprecated `$AddressParse.getCityState` stays deprecated; we do not add more ambiguous city lookups.
- No expansion of geo coverage beyond the existing US/UK datasets.
- No changes to the data files (`usGeoData.ts`, `ukGeoData.ts`) other than what is already exported.
- No breaking changes to existing helper signatures.

## Decisions

1. **Add a unified name-lookup facade method.**
   - `geoData.ts` will expose `State.getStateByNameAndCountry(name, countryCode)`.
   - It delegates to `usGeoData.getStateByName()` for `US` and `ukGeoData.getUKRegionByName()` for `GB`/`UK`.
   - This keeps `normalize.ts` and `addressParse.ts` from importing the raw US/UK modules directly.

2. **`Normalize.address` gets an optional `country` parameter defaulting to `"US"`.**
   - Defaulting to `"US"` preserves existing behavior for templates that do not pass the parameter.
   - For `"US"`, the regex fallback will try to match both 2-letter state codes and full state names, using `getStateByCodeAndCountry` and `getStateByNameAndCountry`.
   - For `"GB"`/`"UK"`, the fallback will match UK region names and codes using the same facade.
   - City data is used only for validation (e.g. confirming the city exists in the dataset), not for resolving state/region from city alone.

3. **AddressParse gets explicit string-returning lookups.**
   - `$AddressParse.getStateName(code, country)` returns the full name or empty string.
   - `$AddressParse.getStateCode(name, country)` returns the ISO code or empty string.
   - Both support `"US"`, `"GB"`, and `"UK"`.
   - String return values keep the existing Velocity-friendly contract (empty string on miss) and avoid exposing raw objects that users would have to access with `.property` syntax.

4. **Keep the existing `getCityState` / `getCityStateCode` methods deprecated and unchanged.**
   - They already warn about ambiguous city-only lookups.
   - We will not add UK equivalents or extend them, because city names are not unique within a country.

5. **Documentation must be updated in all three surfaces.**
   - `connector-spec.json` `sectionHelpMessage` strings for Normal and Unique Attribute Definitions.
   - `docs/guides/define.md` helper reference section.
   - `README.md` if it lists helpers.
   - The `attribute-definition-documentation` spec must be updated to require documentation of the new methods.

6. **Unit tests use the existing `formatting.test.ts` pattern.**
   - Tests call `evaluateVelocityTemplate(...)` with expressions like `$Normalize.address($address, "GB")` and assert on the rendered string.
   - This matches how `$Normalize.name`, `$Normalize.phone`, and `$AddressParse.getCityState` are already tested.

## Risks / Trade-offs

- **Risk: `Normalize.address` behavior changes for US addresses with full state names.**
  - If a template calls `$Normalize.address("Seattle, Washington 98101")` today, it receives the trimmed original string. With this change it would receive `"Seattle, WA 98101"`.
  - **Mitigation:** The country parameter defaults to `"US"`, so the new code path runs. This is a behavior change, not a signature change. We will treat it as an improvement to normalization, document it, and cover it with tests. Admins who relied on the old string would need to stop using `Normalize.address` if they want the raw value.

- **Risk: UK address formats are diverse and hard to normalize with regex.**
  - The `parse-address-string` library is US-centric and will likely fail for most UK addresses.
  - **Mitigation:** The UK path is a best-effort regex fallback. We document the supported formats and return the trimmed original if normalization cannot improve the input.

- **Risk: Users expect world-wide coverage.**
  - The dataset is US/UK only.
  - **Mitigation:** Documentation explicitly states supported country codes (`US`, `GB`, `UK`) and notes that other countries fall back to trim-only behavior.

- **Risk: Object returns are more flexible but harder to use safely in Velocity.**
  - Returning `{ name, isoCode }` would let users do `$obj.name`, but a miss returns `undefined` and property access can fail or render oddly.
  - **Trade-off accepted:** We return strings (or empty strings) for Velocity simplicity, matching every other public helper.

- **Risk: Adding methods to `$AddressParse` blurs its parsing-focused name.**
  - The helper already has lookup methods (`getCityState`), so adding more lookups is consistent with its existing shape, even if the name is slightly off.
  - **Trade-off accepted:** We keep the helpers under `$AddressParse` rather than introducing a new top-level `$Geo` helper, reducing documentation and discovery overhead.

## Migration Plan

No migration is required.

- Existing templates that do not pass a country to `$Normalize.address` continue to work; they may see improved US state normalization for full state names.
- Existing `$AddressParse` methods keep their signatures.
- The new `$AddressParse.getStateName` / `$AddressParse.getStateCode` methods are additive.
- Documentation updates ship with the code change in the next connector release.

## Open Questions

1. Should `Normalize.address` also accept `"CA"` (Canada) even though we have no Canadian dataset, so that callers can pass through a country code consistently without errors? Or should unsupported country codes be treated as `"US"`?
2. Should `AddressParse.getStateName` / `getStateCode` accept a default country when omitted, or require the country parameter explicitly? Requiring it makes the geo dataset limitation obvious; defaulting to `"US"` is more ergonomic.
3. Does `README.md` need a dedicated helper table, or is a one-line mention in the existing Attribute Definitions section sufficient?
