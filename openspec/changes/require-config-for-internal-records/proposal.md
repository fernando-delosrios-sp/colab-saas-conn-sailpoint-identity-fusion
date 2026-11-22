## Why

Currently, any Internal-record dump packaged in the Records Customizer is automatically loaded as an Internal Record source at runtime, without any entry in Source Settings—and configuring a source with the same name fails setup. Meanwhile, matching/non-matching behavior (`includeRecordAccountsInMatch`) is configured during customizer packaging instead of alongside all other Record source settings in the connector UI. This makes it impossible to enable, disable, or toggle Match participation for an Internal Record source from Identity Security Cloud without re-packaging the customizer.

## What Changes

**Internal Record source gating**

- From: Packaged entries in `internal-record-configuration.json` are automatically added as Internal Record sources, and matching a configured source name fails setup.
- To: An Internal Record source is accounted for only when Source Settings has an enabled `Record` source with the **Internal** toggle on whose name matches an entry in the packaged `internal-record-configuration.json`. Unconfigured, disabled, or non-internal packaged entries are ignored. If a configured enabled `Record` source has `Internal` on without a matching packaged entry or manifest, setup fails before Fetch.
- Reason: Unifies source enablement and configuration in Source Settings so administrators control which packaged Internal Record sources are active without re-building the customizer zip.
- Impact: Breaking for deployments that relied on packaged Internal Record sources without an enabled `Record` source (`Internal` on) in Source Settings.

**Source Settings UI and config model**

- Add an `internal` boolean toggle (`label: "Internal"`, `value: "false"`, `parentKey: "sourceType"`, `parentValue: "record"`) to `connector-spec.json` with a brief explanation in `helpKey`.
- Add `internal?: boolean` to `SourceConfig` and normalize it in `sourcesSettings.ts`.

**Records Customizer setup**

- From: `InternalRecordConfigurationEntry` and the interactive packager prompt (`createCliInternalRecordPrompter`) collect `includeRecordAccountsInMatch`.
- To: Remove `includeRecordAccountsInMatch` from `InternalRecordConfigurationEntry`, `InternalRecordPromptAnswers`, `packInternalRecords`, `createCliInternalRecordPrompter`, `customizers/records/internal-record-configuration.json`, and benchmark/test fixtures. Match participation is controlled exclusively by `includeRecordAccountsForMatching` in Source Settings.
- Reason: Eliminates duplicate/split configuration between the customizer and connector Source Settings.
- Impact: Existing `internal-record-configuration.json` files with `includeRecordAccountsInMatch` remain parseable (extra JSON property is ignored), while newly saved configs omit it.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `source-service`: Gate Internal Record source resolution on an enabled `Record` source with `internal: true` in Source Settings; read `includeRecordAccountsForMatching` from Source Settings; ignore unconfigured packaged dumps; fail when an enabled `internal: true` `Record` source has no matching packaged dump.
- `records-customizer`: Remove the Match flag (`includeRecordAccountsInMatch`) from the interactive packager prompt and saved `InternalRecordConfigurationEntry`.
- `ubiquitous-language`: Update **Internal Record source** and **Internal Record configuration** definitions to reflect Source Settings gating and removal of `includeRecordAccountsInMatch` from the customizer config.
- `documentation-site`: Update configuration guides and glossary to document the **Internal** toggle on Record sources and removal of the Match prompt from the Records Customizer setup.

## Impact

- Configuration schema & settings: `connector-spec.json`, `src/model/config.ts`, `src/data/config/settings/sourcesSettings.ts`
- Source service & packager: `src/services/sourceService/sourceDiscovery.ts`, `src/services/sourceService/internalRecordConfiguration.ts`, `src/services/sourceService/internalRecordPack.ts`
- Customizer assets: `customizers/records/internal-record-configuration.json`, `customizers/records/scripts/benchmark-internal-records.mts`
- Tests & docs: `src/data/config/settings/__tests__/sourcesSettings.test.ts`, `src/services/sourceService/__tests__/internalRecordSource.test.ts`, `src/services/sourceService/__tests__/internalRecordPack.test.ts`, `src/services/sourceService/__tests__/internalRecordFormat.test.ts`, `src/services/sourceService/__tests__/sourceService.test.ts`, `docs/glossary.md`, `docs/use-guides/configuration/*.md`
