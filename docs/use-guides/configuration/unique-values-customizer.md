# Unique Values Customizer

The **Unique Values Customizer** provides a zero-heap, decoupled mechanism to reserve attribute values (such as legacy usernames, historical employee numbers, and service account IDs) so Identity Fusion NG never issues colliding values during Unique attribute generation.

**Configuration reference:** [Defining attributes](defining-attributes.md) · [Glossary](../../glossary.md)

!!! note "Didactic guide"
    This page explains how to configure, compile, and package the standalone Unique Values Customizer.

---

## When to use the Unique Values Customizer

| Scenario | Standard aggregation | Unique Values Customizer |
| --- | --- | --- |
| **Large reserved pools (>50k values)** | ❌ High heap usage; risk of container OOM | ✅ Compact sorted 64-bit binary indexes (<1 MB for 100k values) |
| **Decoupled updates** | ❌ Requires source data sync or connector release | ✅ Update CSV files and re-upload customizer package |
| **Performance** | String allocation in V8 heap sets | Sub-microsecond binary search with zero heap allocations |

---

## Customizer project structure

The customizer template lives in `customizers/unique-ids/`:

```text
customizers/unique-ids/
├── data/                    # Generated .bin binary index files
├── scripts/
│   └── build-indices.ts     # Pre-pack script compiling CSVs to .bin
├── src/
│   └── index.ts             # Customizer entry point (beforeStdAccountList hook)
├── values/                  # Attribute value CSV files (one per attribute)
│   ├── .gitkeep
│   └── sAMAccountName.csv   # One reserved value per line
├── package.json
└── tsconfig.json
```

---

## Step-by-step workflow

### 1. Populate attribute CSV files

Create a single-column CSV file in `customizers/unique-ids/values/` named after the target unique attribute (e.g. `sAMAccountName.csv`, `employeeNumber.csv`).

```text
admin
administrator
root
guest
service_backup
```

- Each non-empty trimmed line represents a reserved value.
- Empty lines and leading/trailing whitespace are ignored.
- Values are case-sensitive matching the target unique attribute generator.

### 2. Build and package the customizer

Inside `customizers/unique-ids/`, run:

```bash
npm run pack-zip
```

This script:

1. Executes `build-indices.ts` to hash lines using 64-bit FNV-1a.
2. Deduplicates and sorts the 64-bit integers in ascending order.
3. Writes contiguous 8-byte integers into `data/<attributeName>.bin`.
4. Bundles the customizer code and binary indexes into a deployable customizer zip via `spcx package`.

### 3. Deploy to Identity Security Cloud

1. In ISC, navigate to **Connections** > **Connectors** > **Identity Fusion**.
2. Upload the compiled customizer zip file to the customizer slot.
3. Run an account aggregation.

---

## Runtime operation and logging

When an aggregation runs:

1. The customizer hook (`beforeStdAccountList`) resolves the index directory and injects `customizerIndicesDir` into the command input.
2. `DefinitionService` loads the index files into the **Customizer Value Store**.
3. During unique attribute generation, candidate values are evaluated against the customizer store using binary search before checking live accounts.
4. If a collision occurs, Identity Fusion automatically regenerates or appends a disambiguation counter.

### Structured logs

During the Setup phase, the connector emits structured audit logs:

- **Informational log:**
  `Loaded customizer unique index store from /path/to/data: 2 attribute(s), 50000 total value(s) in 12ms`
- **Detail log:**
  `[operationContext] DETAIL action="customizer unique store loaded" directory="..." attributes={"sAMAccountName":45000,"employeeNumber":5000} totalValues=50000 durationMs=12`
- **Debug log (when customizer is not attached):**
  `No customizer unique value store was attached`

---

## Historical Record sources

A historical-record dump is a headered CSV of complete account records. Place it in `customizers/unique-ids/records/` and name it for the source, for example `Historical Records.csv`. The dump must include a `nativeIdentity` column. Other columns become account attributes. Quoted commas, quotes, and line breaks are preserved.

```text
customizers/unique-ids/
├── records/
│   └── Historical Records.csv
└── data/historical-records/
    ├── manifest.json
    └── Historical-Records-0000.hrb
```

`npm run pack-zip` compiles each `records/*.csv` into a versioned manifest and compact binary shards under `data/historical-records/`. The original CSV is not included in the deployable package. An index-only package remains valid.

In Source Settings, add a Records source and set **Historical record file** to that file name. The source name is the label used in processing and reports. Identity Security Cloud does not need a managed source with the same name. **Include record accounts in Match** defaults to on. Turn it off to keep selective Map and unique-attribute registration without Match scoring. An unmatched historical record does not create a Fusion account.

Reports show the Record source type and an `INTERNAL` badge for every historical reference. The account name is not linked to an ISC account.

### Package compatibility and failures

Rebuild and upload the customizer with the connector version that reads the manifest. Setup fails before Fetch when the configured file is missing, the manifest version is unsupported, or the dump has duplicate headers, a missing `nativeIdentity` header, or malformed CSV. The error names the file and the invalid header or row.

### Benchmark and runtime memory

Run the comparison from `customizers/unique-ids/`:

```bash
npm run benchmark:historical-records
```

The command measures streaming CSV and the compiled artifact in separate processes. It records package bytes, elapsed time, records per second, heap usage, external memory, RSS, and the filesystem type when the platform exposes it. Results are written to `customizers/unique-ids/benchmark/results.md`.

The customizer runtime filesystem may be a ramfs. Files stored there still consume the runtime memory budget, so compiling the dump does not move it out of RAM. The compiled form avoids retaining the CSV text and the full parsed collection; aggregation still streams, prunes, and releases records. Treat the published measurements as environment-specific evidence, not as a claim that filesystem storage lowers container memory.

## Related guides

- [Defining attributes](defining-attributes.md): Velocity expressions, unique definitions, and collision counters.
- [Mapping attributes](mapping-attributes.md): Merging source accounts into Fusion accounts.
- [Monitoring aggregation progress](../operation/monitor-aggregation-progress.md): Tracking phase progress and heartbeat logs.
