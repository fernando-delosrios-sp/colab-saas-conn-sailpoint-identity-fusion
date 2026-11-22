## 1. Source Settings UI and Config Model

- [x] 1.1 Add `internal` toggle (`key: "internal"`, `label: "Internal"`, `type: "toggle"`, `required: false`, `value: "false"`, `parentKey: "sourceType"`, `parentValue: "record"`) with a brief `helpKey` explaining Internal Record sources in `connector-spec.json`.
- [x] 1.2 Add `internal?: boolean` to `SourceConfig` in `src/model/config.ts` and normalize `internal` (default `false`) in `src/data/config/settings/sourcesSettings.ts`.
- [x] 1.3 Add unit tests in `src/data/config/settings/__tests__/sourcesSettings.test.ts` verifying `internal` normalization and default `false`.

## 2. Source Discovery Gating for Internal Record Sources

- [x] 2.1 Update `src/services/sourceService/sourceDiscovery.ts` (`fetchAllSources`) so enabled `Record` sources with `internal: true` resolve from `deps.internalRecordsDir` (`internal-record-configuration.json` and `manifest.json`) by matching `entry.sourceName === sourceConfig.name` instead of querying ISC `apiSourcesByName`.
- [x] 2.2 Ignore packaged `internal-record-configuration.json` entries that have no matching enabled `Record` source with `internal: true` in `state.sources`, and fail setup before Fetch (naming the source or file) when an enabled `internal: true` `Record` source has no `internalRecordsDir`, no matching entry, or no manifest entry.
- [x] 2.3 Ensure resolved Internal Record `SourceInfo` uses `sourceConfig` from Source Settings (honoring `includeRecordAccountsForMatching` and `accountJmespathFilter`, with fallback to `entry.accountJmespathFilter` when `sourceConfig.accountJmespathFilter` is unset).
- [x] 2.4 Update `src/services/sourceService/__tests__/internalRecordSource.test.ts` to cover: configured `Record` + `internal: true` source resolving from package without ISC lookup, unconfigured/disabled/non-internal packaged dumps being ignored, missing package/entry/manifest failing setup, and `includeRecordAccountsForMatching` coming from Source Settings.

## 3. Remove Match Settings from Records Customizer Setup

- [x] 3.1 Remove `includeRecordAccountsInMatch` from `InternalRecordConfigurationEntry` and `InternalRecordPromptAnswers` in `src/services/sourceService/internalRecordConfiguration.ts`.
- [x] 3.2 Remove `includeRecordAccountsInMatch` prompting and persistence from `packInternalRecords` and `createCliInternalRecordPrompter` in `src/services/sourceService/internalRecordPack.ts`.
- [x] 3.3 Remove `includeRecordAccountsInMatch` from `customizers/records/internal-record-configuration.json`, `customizers/records/scripts/benchmark-internal-records.mts`, and tests (`internalRecordPack.test.ts`, `internalRecordFormat.test.ts`, `sourceService.test.ts`).

## 4. Verification

- [x] 4.1 Confirm canonical test and lint commands: `npm test`, `npm run build`, `npm run lint`, `npm run lint:markdown`, `npm run lint:docs-guides`, `npm run docs:prepare`.
- [x] 4.2 Verify all delta spec scenarios are covered by passing unit tests in `sourcesSettings.test.ts`, `internalRecordSource.test.ts`, `internalRecordPack.test.ts`, `internalRecordFormat.test.ts`, and `sourceService.test.ts`.

## 5. Documentation

- [x] 5.1 Update `docs/glossary.md` for **Internal Record source** and **Internal Record configuration** (removing `Include record accounts in Match` from the customizer config definition).
- [x] 5.2 Update `docs/use-guides/configuration/records-customizer.md`, `docs/use-guides/configuration/source-types.md`, and `docs/use-guides/configuration/configuring-sources-and-scope.md` to document the **Internal** toggle on Record sources and the removal of Match prompting from the customizer pack.
- [x] 5.3 Verify docs with `npm run lint:markdown`, `npm run lint:docs-guides`, and `npm run docs:prepare`.

## 6. Changelog

- [x] 6.1 Invoke `changelog-generator` to add/update the `CHANGELOG.md` entry under the current `package.json` version for this change.
- [x] 6.2 Confirm the changelog entry covers the user-visible changes from `proposal.md`.
