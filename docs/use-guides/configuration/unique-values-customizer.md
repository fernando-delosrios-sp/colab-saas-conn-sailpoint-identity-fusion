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

## Related guides

- [Defining attributes](defining-attributes.md): Velocity expressions, unique definitions, and collision counters.
- [Mapping attributes](mapping-attributes.md): Merging source accounts into Fusion accounts.
- [Monitoring aggregation progress](../operation/monitor-aggregation-progress.md): Tracking phase progress and heartbeat logs.
