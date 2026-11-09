## Why

Populating reserved attribute values (such as legacy IDs, reserved usernames, and external employee numbers) through standard managed account aggregation loads hundreds of thousands of full account objects into memory, frequently triggering JavaScript heap exhaustion in cloud container environments. Tenants also need a way to maintain these reserved pools independently without modifying or rebuilding the connector source. Providing a pre-compiled binary store within a dedicated SaaS Connectivity customizer eliminates V8 string and object memory overhead during uniqueness checks while decoupling tenant data updates from connector releases.

## What Changes

- Add a standalone customizer project template in `customizers/unique-ids/` with a build-time pre-pack script that converts single-column attribute CSV files into compact, sorted 64-bit binary hash indexes (`.bin`).
- Add a customizer hook (`beforeStdAccountList`) that passes the compiled index directory path to Identity Fusion via the command `input`.
- Introduce `CustomizerValueStore` in Identity Fusion to load binary index buffers and perform sub-microsecond binary search collision checks.
- Update `DefinitionService.isCandidateValueUnique` to consult `CustomizerValueStore` before checking in-memory sets.
- Emit structured log traces during aggregation setup detailing the customizer directory, loaded attribute names, indexed value counts, and load timings.

## Capabilities

### New Capabilities
- `unique-values-customizer`: Standalone SaaS customizer project compiling single-column attribute value CSVs into sorted 64-bit binary hash index files and passing the directory via connector command input.

### Modified Capabilities
- `definition-service`: Consult `CustomizerValueStore` during unique attribute value candidate validation and log index loading metrics.
- `ubiquitous-language`: Add canonical definitions for `Customizer Value Store` and `Unique Values Customizer`.

## Impact

- **Customizer Artifacts**: New subproject in `customizers/unique-ids/` containing `package.json`, `tsconfig.json`, `scripts/build-indices.ts`, and `src/index.ts`.
- **Connector Core**: New `CustomizerValueStore` class in `src/services/definitionService/` or `src/services/` and updates to `DefinitionService`.
- **Aggregation Pipeline**: `setupPhase` in `src/operations/helpers/accountListPhases.ts` (or `accountList.ts`) receives `input.customizerIndicesDir` and initializes `CustomizerValueStore`.
- **Logging**: Added structured audit logs for loaded customizer index files.
- **Dependencies**: No new external runtime dependencies; uses native Node.js `fs`, `path`, and `crypto`.
