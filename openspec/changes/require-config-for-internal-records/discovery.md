## Scope

Require an enabled Record source with the **Internal** toggle on in Source Settings for an **Internal Record source** to be accounted for, add the **Internal** toggle (with a brief explanation) to Record sources in `connector-spec.json`, and remove `includeRecordAccountsInMatch` from the Records Customizer setup; out of scope: changing how non-internal Record sources, CSV compilation, or shard streaming work.

## Language

**Internal Record source** (`promote`):
A Record source packaged with the Records Customizer, named in the Internal Record configuration, and enabled in Source Settings with **Source type** set to **Records** and **Internal** toggled on.
_Avoid_: internal sources config, file-field internal source

**Internal Record configuration** (`promote`):
The saved packaging decisions for the Internal Record sources in a Records Customizer package: source name, Internal Record schema, and Accounts JMESPath filter (no longer stores `includeRecordAccountsInMatch`, which moves to Source Settings).
_Avoid_: internal sources config, Source Settings

## Decisions

1. **Source Settings gating**:
    - `connector-spec.json` adds an `internal` toggle (`type: "toggle"`, `value: "false"`, `parentKey: "sourceType"`, `parentValue: "record"`) with a brief `helpKey` explaining that accounts are loaded from the packaged Records Customizer dump matching the source name instead of Identity Security Cloud.
    - `SourceConfig` (`src/model/config.ts`) and `sourcesSettings.ts` normalize `internal?: boolean` (default `false`).
2. **Source discovery resolution (`src/services/sourceService/sourceDiscovery.ts`)**:
    - Enabled configured sources with `sourceType === SourceType.Record` and `internal === true` are resolved from `deps.internalRecordsDir` (`internal-record-configuration.json` + `manifest.json`) by matching `entry.sourceName === sourceConfig.name`, rather than querying ISC `apiSourcesByName`.
    - If a configured enabled `Record` source has `internal: true` but `deps.internalRecordsDir` is absent, or no matching entry exists in `internal-record-configuration.json` or `manifest.json`, setup fails before Fetch with an error naming the source.
    - Packaged entries in `internal-record-configuration.json` without a matching enabled `Record` source with `internal: true` in Source Settings are ignored (not accounted for).
    - Configured sources with `internal` false/omitted (including non-internal `Record` sources) continue to resolve from ISC `apiSourcesByName` as before.
    - `includeRecordAccountsForMatching` and `accountJmespathFilter` come from `sourceConfig` in Source Settings (falling back to `entry.accountJmespathFilter` only when `sourceConfig.accountJmespathFilter` is unset).
3. **Customizer setup cleanup**:
    - Remove `includeRecordAccountsInMatch` from `InternalRecordConfigurationEntry`, `InternalRecordPromptAnswers`, `packInternalRecords`, `createCliInternalRecordPrompter`, `customizers/records/internal-record-configuration.json`, `customizers/records/scripts/benchmark-internal-records.mts`, and tests.
    - Retain `accountJmespathFilter`, `accountIdField`, `accountNameField`, and `schema` in `InternalRecordConfigurationEntry`.

## Open questions

None.

## Scenarios discussed

- Packaged dump exists in `internal-record-configuration.json`, but Source Settings has no matching source (or it is disabled, or `internal` is false, or `sourceType` is not `record`): packaged dump is ignored and not accounted for.
- Source Settings has an enabled `Record` source with `internal: true` and matching packaged dump: resolved as an Internal Record source without calling ISC for that source's accounts; honors `includeRecordAccountsForMatching` from Source Settings.
- Source Settings has an enabled `Record` source with `internal: true`, but no customizer package or no matching entry in `internal-record-configuration.json` or `manifest.json`: setup fails before Fetch and names the source.
- Interactive Records Customizer pack (`createCliInternalRecordPrompter`): no longer prompts for `Include record accounts in Match? [y/n]`.
