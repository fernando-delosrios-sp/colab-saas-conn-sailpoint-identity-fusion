## Context

Internal Record sources currently bypass Source Settings: `SourceDiscovery` (`src/services/sourceService/sourceDiscovery.ts`) looks up all configured enabled sources in Identity Security Cloud (`apiSourcesByName`) and then appends every entry in the customizer's `internal-record-configuration.json` via `appendInternalRecordSources`, rejecting any entry whose `sourceName` matches a configured source. Meanwhile, `includeRecordAccountsInMatch` is stored in `internal-record-configuration.json` during customizer packaging (`src/services/sourceService/internalRecordPack.ts`), duplicating the `includeRecordAccountsForMatching` toggle already present on `Record` sources in `connector-spec.json`.

## Goals / Non-Goals

**Goals:**

- Require an enabled Source Settings entry with `sourceType: "record"` and `internal: true` for a packaged Internal Record source to be resolved and processed.
- Add the `internal` toggle (with a brief explanation) to `Record` sources in `connector-spec.json`, `SourceConfig`, and `sourcesSettings.ts`.
- Remove `includeRecordAccountsInMatch` from the Records Customizer configuration model, CLI prompter, and packaged config, using `includeRecordAccountsForMatching` from Source Settings instead.
- Keep non-internal `Record` sources, `Authoritative` sources, and `Orphan` sources resolving from Identity Security Cloud as before.

**Non-Goals:**

- Changing the binary shard format, `manifest.json` structure, or streaming reader (`internalRecordFormat.ts`).
- Changing how `includeRecordAccountsForMatching` is executed in `MatchingService` or `FusionService`.
- Removing `accountJmespathFilter` from `InternalRecordConfigurationEntry` (if present in a packaged entry and unset in Source Settings, it can still be honored or overridden by Source Settings).

## Decisions

### D1: Source Settings `internal` toggle placement and default

- **Choice**: Add `internal` (`type: "toggle"`, `value: "false"`, `required: false`, `parentKey: "sourceType"`, `parentValue: "record"`) to `connector-spec.json` under `sources` -> `Source Configuration`, and normalize `internal?: boolean` (default `false`) in `sourcesSettings.ts` and `SourceConfig`.
- **Reason**: Placing `internal` under `sourceType: "record"` keeps it scoped to Record sources alongside `includeRecordAccountsForMatching` and `accountJmespathFilter`, and defaulting to `false` preserves existing ISC-backed Record sources.
- **Considered alternatives**: Adding a fourth `sourceType` value (e.g., `internalRecord`) — rejected because the user explicitly requested an `Internal` toggle on record type sources, and Internal Record sources share all Record-type processing semantics.

### D2: Source discovery resolution in `fetchAllSources`

- **Choice**: Partition `state.sources` (which already contains only `enabled: true` sources after `sourcesSettings.ts`) during `fetchAllSources`:
    - Sources where `sourceType === SourceType.Record && internal === true` are resolved from `deps.internalRecordsDir` (`loadPackagedInternalRecordConfiguration` + `loadInternalRecordManifest`) by matching `entry.sourceName === sourceConfig.name`. They are NOT looked up in `apiSourcesByName`.
    - All other enabled sources are looked up in `apiSourcesByName` as before.
    - Packaged entries in `internal-record-configuration.json` with no matching enabled `Record` + `internal: true` source in `state.sources` are ignored.
    - If an enabled `Record` + `internal: true` source is configured, but `deps.internalRecordsDir` is absent, `internal-record-configuration.json` lacks an entry for `sourceConfig.name`, or `manifest.json` lacks `entry.fileName`, `fetchAllSources` throws `InternalRecordFormatError` naming the source/file before Fetch.
- **Reason**: Gives administrators explicit control via Source Settings (`enabled`, `internal`, `includeRecordAccountsForMatching`, `accountJmespathFilter`, `accountLimit`) and fails fast if an expected internal dump is missing from the customizer package.
- **Considered alternatives**: Warning instead of failing when an `internal: true` source is missing from the customizer package — rejected because silently skipping an explicitly enabled source would hide misconfiguration and could drop expected unique-value reservations.

### D3: Removing `includeRecordAccountsInMatch` from customizer setup

- **Choice**: Remove `includeRecordAccountsInMatch` from `InternalRecordConfigurationEntry`, `InternalRecordPromptAnswers`, `packInternalRecords`, and `createCliInternalRecordPrompter`. In `sourceDiscovery.ts`, `SourceInfo.config` uses the `sourceConfig` from Source Settings (which already normalizes `includeRecordAccountsForMatching` with default `true`). For `accountJmespathFilter`, prefer `sourceConfig.accountJmespathFilter` when non-empty and fall back to `entry.accountJmespathFilter` if present.
- **Reason**: Eliminates the redundant Match question in the customizer CLI and makes Source Settings the single source of truth for Match participation.
- **Considered alternatives**: Keeping `includeRecordAccountsInMatch` as an optional override — rejected because the user asked to remove matching/non-matching settings from the customizer internal source setup.

## Risks / Trade-offs

- **[Risk] Existing deployments with packaged Internal Record sources not listed in Source Settings** -> Mitigation: Document the breaking change clearly in `CHANGELOG.md` and use-guides (`records-customizer.md`, `source-types.md`, `configuring-sources-and-scope.md`); administrators simply add a `Record` source with the same name and toggle `Internal` on.
- **[Risk] Existing `internal-record-configuration.json` files on disk still contain `"includeRecordAccountsInMatch"`** -> Mitigation: TypeScript/JSON parsing ignores unknown properties at runtime, so existing packaged files will continue to load without error; `sourceDiscovery.ts` ignores the field and reads `includeRecordAccountsForMatching` from `sourceConfig`.

## Migration Plan

1. Update `connector-spec.json`, `SourceConfig`, `sourcesSettings.ts`, `sourceDiscovery.ts`, `internalRecordConfiguration.ts`, `internalRecordPack.ts`, and `customizers/records/` files.
2. Update unit tests and documentation.
3. For existing tenants upgrading: add each active Internal Record source to Source Settings with `Source type: Records`, `Internal: On`, and set `Include record accounts in Match` as desired.
