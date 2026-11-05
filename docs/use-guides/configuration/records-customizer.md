# Records Customizer

The **Records Customizer** packages Internal-record dumps and the Internal Record configuration for Identity Fusion. Each dump becomes an Internal Record source. Unique values are reserved when those accounts carry them, not from a separate list of strings.

**Configuration reference:** [Source types](source-types.md) · [Glossary](../../glossary.md)

!!! note "Didactic guide"
This page explains how to prepare dumps, save the Internal Record configuration, and package the Records Customizer.

---

## When to use the Records Customizer

| Need                                                                                  | What to do                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Accounts that should follow the Record path without an Identity Security Cloud source | Put a headered CSV in `records/` and pack it                                      |
| A username or employee number that must stay reserved                                 | Put that value on an account in the dump, on the unique attribute                 |
| Match, filtering, Account ID, and Account Name                                        | Confirm them while packaging. They are saved in the Internal Record configuration |

A bare list of usernames no longer reserves those usernames. Replace each old `values/*.csv` list with an Internal-record dump that carries the values on a unique attribute, then pack that dump.

---

## Customizer project structure

The customizer template lives in `customizers/records/`:

```text
customizers/records/
├── internal-record-configuration.json   # Saved packaging decisions
├── records/                             # Internal-record dumps (not uploaded)
│   └── Sample Records.csv
├── scripts/
│   └── build-internal-records.mts       # Pack script
├── src/
│   └── index.ts                         # beforeStdAccountList hook
├── data/internal-records/               # Generated manifest, configuration, and shards
├── package.json
└── tsconfig.json
```

---

## Step-by-step workflow

### 1. Add an Internal-record dump

Place a headered CSV in `customizers/records/records/`. Commas and quotes follow RFC 4180. The file does not need a `nativeIdentity` column. You choose the Account ID and Account Name columns while packaging.

### 2. Pack and save the Internal Record configuration

Inside `customizers/records/`, run:

```bash
npm run pack-zip
```

On an interactive terminal, each `records/*.csv` that has no saved entry prompts for:

- Source name
- Include record accounts in Match
- Accounts JMESPath filter
- Account ID field
- Account Name field

The pack also infers an Internal Record schema: one field per header. A field starts multi-valued when any cell contains an unquoted semicolon. A semicolon inside quotes does not. At the prompt:

- `toggle <field>` flips that field's multi-valued flag
- `rescan` reads the CSV again after you edit it
- `continue` accepts the schema

The answers are written to `internal-record-configuration.json`. The next pack reuses them and does not prompt. Edit that file between packs when you want to change a saved answer. A pack with no interactive terminal fails when any dump has no saved entry, and the error names the file.

Packaging fails when two entries use the same source name, when the Accounts JMESPath filter is invalid, or when an Account ID is blank or duplicated. Those errors name the file and, for a bad row, the row.

The deployable zip includes the Internal Record configuration, the manifest, and the shards. It does not include the original CSV.

### 3. Deploy to Identity Security Cloud

1. Upload the customizer zip to the Identity Fusion customizer slot.
2. Remove any **Internal record file** value left in Source Settings from an older package. That field is no longer read.
3. Run an account aggregation.

Do not give an Internal Record source the same name as a configured source. Setup fails before Fetch and names that source. A configured source with a different name still comes from Identity Security Cloud.

---

## What the connector does with the package

`beforeStdAccountList` returns the directory that holds the Internal Record configuration, manifest, and shards. It does not return a unique-value index directory.

Each saved entry becomes an Internal Record source with Record type and internal provenance. Include record accounts in Match and the Accounts JMESPath filter come from that entry. An empty filter accepts every row. The Account ID field becomes `nativeIdentity`. The Account Name field becomes the account name, and an empty name falls back to the Account ID. A multi-valued field is split on unquoted semicolons into a list of strings. A quoted semicolon stays inside one list entry. A field saved as single-valued keeps an unquoted semicolon inside the string.

Match on follows the Record Match path. Match off registers mapped unique attributes and does not score. An unmatched record does not create a Fusion account.

A value on a unique attribute is reserved when record registration stores it. Unique generation rejects a candidate that is already in that registered set. There is no Customizer Value Store.

Reports keep the Record label and add an `INTERNAL` badge. Those accounts have no Identity Security Cloud account link.

### Package compatibility and failures

Rebuild and upload the customizer with the connector version that reads the manifest. Setup fails before Fetch when a saved dump is missing from the manifest or the manifest version is unsupported. The error names the file.

### Benchmark and runtime memory

Run the comparison from `customizers/records/`:

```bash
npm run benchmark:internal-records
```

The command measures streaming CSV and the compiled artifact in separate processes. It records package bytes, elapsed time, records per second, heap usage, external memory, RSS, and the filesystem type when the platform exposes it. Results are written to `customizers/records/benchmark/results.md`.

The customizer runtime filesystem may be a ramfs. Files stored there still consume the runtime memory budget, so compiling the dump does not move it out of RAM. The compiled form avoids retaining the CSV text and the full parsed collection; aggregation still streams, prunes, and releases records. A large dump registers unique values into an in-memory set. Treat the published measurements as environment-specific evidence, not as a claim that filesystem storage lowers container memory.

## Related guides

- [Source types](source-types.md): Record processing and the Internal Record source.
- [Defining attributes](defining-attributes.md): Velocity expressions, unique definitions, and collision counters.
- [Monitoring aggregation progress](../operation/monitor-aggregation-progress.md): Tracking phase progress and heartbeat logs.
