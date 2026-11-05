## 1. Packaging and Internal Record configuration

- [x] 1.1 Add `customizers/records/internal-record-configuration.json` as the saved input and copy it into the packaged data directory beside the manifest
- [x] 1.2 Prompt on an interactive pack when a `records/*.csv` file has no saved entry, and persist source name, Include record accounts in Match, Accounts JMESPath filter, Account ID, Account Name, and the schema
- [x] 1.3 Fail a non-interactive pack when a dump has no saved entry, and fail packaging when two entries share a source name
- [x] 1.4 Infer one schema field per header, mark a field multi-valued when any value has an unquoted semicolon, and let the operator flip that flag or edit the CSV and re-scan
- [x] 1.5 Validate the saved JMESPath expression at pack time and reject a blank or duplicate Account ID with the file and row

## 2. Stream-readable artifacts

- [x] 2.1 Compile configured dumps with RFC 4180 commas and quotes into the versioned manifest and shards, excluding the source CSV from the zip
- [x] 2.2 Map the saved Account ID field to `nativeIdentity` and the Account Name field to the account name, falling back to Account ID when the name is empty
- [x] 2.3 Keep shard reads sequential and bounded, and split unquoted semicolons into a string list only for fields the saved schema marks multi-valued

## 3. Connector Record path

- [x] 3.1 Resolve each packaged configuration entry as a Record source with internal provenance, and stop reading an internal-record file from Source Settings
- [x] 3.2 Apply the saved Accounts JMESPath filter while streaming, and apply the saved Match flag to the existing Record path
- [x] 3.3 Fail setup before Fetch when an Internal Record source name equals a configured source name, and keep the Identity Security Cloud feed for every other configured source
- [x] 3.4 Return the Internal Record package location from `beforeStdAccountList` and stop returning `customizerIndicesDir`

## 4. Retire the reserved-value index

- [x] 4.1 Remove `values/` compilation, `.bin` unique indexes, and Customizer Value Store loading
- [x] 4.2 Make unique-candidate checks use only the registered-value set, including values registered from Internal Record accounts
- [x] 4.3 Update the per-base collision error so it names a managed-source or Internal Record value and no longer names a customizer index

## 5. Verification

- [x] 5.1 Confirm canonical test command: `npm test`
- [x] 5.2 Cover every delta spec scenario with named automated tests, including interactive versus non-interactive pack, schema inference, name collision, JMESPath filtering, and unique-value collision

## 6. Documentation

- [x] 6.1 Update `docs/use-guides/configuration/records-customizer.md` for dump packaging, the saved configuration, and removal of `values/`
- [x] 6.2 Update `docs/use-guides/configuration/source-types.md` and `docs/use-guides/configuration/configuring-sources-and-scope.md` so Internal Record sources come from the package rather than a Source Settings file field
- [x] 6.3 Update `docs/glossary.md` for Internal Record schema, Internal Record configuration, and the retired Customizer Value Store
- [x] 6.4 Remove the internal-record file field from `connector-spec.json` and refresh JSDoc on the pack and source-resolution entry points

## 7. Changelog

- [x] 7.1 Create or update the changelog entry for this change via the changelog-generator skill
- [x] 7.2 Confirm the entry covers the breaking removal of reserved-value indexes and the new packaging flow for Internal Record sources
