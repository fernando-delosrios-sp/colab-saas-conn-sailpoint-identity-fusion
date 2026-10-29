## 1. Customizer Project

- [x] 1.1 Create `customizers/unique-ids/package.json` with `@sailpoint/connector-sdk` dependency, build scripts, and `pack-zip`
- [x] 1.2 Create `customizers/unique-ids/tsconfig.json`
- [x] 1.3 Implement `customizers/unique-ids/scripts/build-indices.ts` compiling single-column CSV files into sorted 64-bit FNV-1a binary index files (`.bin`)
- [x] 1.4 Implement `customizers/unique-ids/src/index.ts` with `beforeStdAccountList` hook passing `customizerIndicesDir` in `input`
- [x] 1.5 Add `customizers/unique-ids/values/` directory with `.gitkeep` and sample CSV template
- [x] 1.6 Add automated tests verifying index compilation, deduplication, sorting, and empty file handling

## 2. Fusion CustomizerValueStore

- [x] 2.1 Implement `CustomizerValueStore` in `src/services/definitionService/customizerValueStore.ts` using 64-bit FNV-1a hashing and `BigInt64Array` binary search
- [x] 2.2 Add unit tests for `CustomizerValueStore` covering hit, miss, empty index, and case-sensitive matching

## 3. DefinitionService & Pipeline Integration with Logging

- [x] 3.1 Integrate `CustomizerValueStore` into `DefinitionService.isCandidateValueUnique` to reject candidate values matching customizer indexes
- [x] 3.2 Wire `input.customizerIndicesDir` through `accountList` and `setupPhase` into `ServiceRegistry` and `DefinitionService`
- [x] 3.3 Emit structured log traces (`log.info` / `log.detail`) detailing loaded customizer directory, attribute names, unique value counts, and load timings
- [x] 3.4 Add unit tests for `DefinitionService` verifying rejection of customizer-reserved unique values and log emission

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` and `npm run lint`
- [x] 4.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 5. Documentation

- [x] 5.1 Document the Unique Values Customizer workflow and packaging in `docs/use-guides/configuration/`
- [x] 5.2 Update `openspec/specs/ubiquitous-language/spec.md` with promoted terms (`Customizer Value Store`, `Unique Values Customizer`)
- [x] 5.3 Run `npm run lint:docs-guides` and `npm run lint:markdown` to verify documentation integrity

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change
- [x] 6.2 Confirm entry covers user-visible changes from proposal Capabilities
