## Why

Internal Record accounts are identified from Source Settings at runtime, and a separate reserved-value index is the only way to block unique generation with a list of taken strings. Operators need Match, filtering, Account ID, and Account Name decided from the dump before the customizer is uploaded. Packaging that configuration lets the connector treat each dump as a Record source and retire the hash index.

## What Changes

**Internal Record configuration**
- From: A Source Settings entry names an internal-record file, forces Record type, and the dump must already contain a `nativeIdentity` column.
- To: Packaging `records/*.csv` saves the source name, Internal Record schema, Include record accounts in Match, and Accounts JMESPath filter. The connector reads that package and does not look up an Identity Security Cloud source for it.
- Reason: Those choices have to be settled before the package reaches Identity Security Cloud.
- Impact: Breaking for customizers that rely on `values/*.csv` hash indexes or on the Source Settings internal-record file field.

**Reserved unique values**
- From: Single-column files in `values/` compile to sorted hash indexes, and unique generation rejects candidates found there.
- To: `values/` and the Customizer Value Store are removed. A value is reserved when an Internal Record account carries it on a unique attribute and record registration runs.
- Reason: Internal Record sources supersede the reserved-value list.
- Impact: Breaking. A bare list of usernames no longer reserves those usernames.

**Schema and CSV**
- Packaging infers one field per header. A field starts multi-valued when any value contains an unquoted semicolon. The operator may flip that flag or edit the CSV and re-scan. The connector splits on unquoted semicolons only where the saved schema says the field is multi-valued. Commas and quotes follow RFC 4180.

**Name collision**
- Packaging fails when two dumps share a source name. Connector setup fails when an Internal Record source name equals a configured source name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `records-customizer`: Interactive packaging of Internal-record dumps, saved Internal Record configuration, and removal of the `values/` hash-index build and `customizerIndicesDir` hook.
- `internal-record-sources`: Schema inference, multi-valued fields, Account ID and Account Name mapping, and compilation from saved configuration instead of a required `nativeIdentity` header.
- `source-service`: Load Internal Record sources from the packaged configuration, apply the saved JMESPath filter, and reject a name that matches a configured source.
- `definition-service`: Stop consulting a Customizer Value Store. Unique collisions come from registered account values.
- `ubiquitous-language`: Retire Customizer Value Store. Redefine Records Customizer and Internal Record source. Add Internal Record schema and Internal Record configuration.

## Impact

- `customizers/records/` packaging scripts, `records/` dumps, and the customizer hook.
- Connector source discovery, internal-record streaming, and unique generation.
- Source Settings loses the internal-record file field.
- Use guides for the Records Customizer, source types, and unique attributes.
- Existing deployed customizers that ship only `.bin` indexes stop reserving values until those lists are replaced by Internal-record dumps.
