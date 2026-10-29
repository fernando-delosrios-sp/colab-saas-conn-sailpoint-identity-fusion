## Scope

Provide a standalone SaaS Connectivity customizer package in `customizers/unique-ids/` that compiles per-attribute unique value CSV files into compact sorted 64-bit binary hash indexes at packaging time, and integrate a low-memory `CustomizerValueStore` into Identity Fusion's `DefinitionService` to reject candidate collisions with zero heap accumulation and structured log auditing.

Out of scope: modifying live ISC account records, supporting non-unique attribute definitions, dynamic runtime file downloads from cloud object storage, or full multi-attribute record correlation.

## Language

**Customizer Value Store** (`promote`):
A memory-efficient, binary-indexed store within Identity Fusion that loads pre-compiled 64-bit hash arrays from a linked customizer package to verify whether candidate attribute values conflict with existing reserved values without allocating string objects on the V8 heap.
_Avoid_: static cache, disk table, record dump.

**Unique Values Customizer** (`promote`):
A standalone SailPoint SaaS Connectivity customizer project containing single-column CSV files corresponding to unique attribute names, packaged with a build-time pre-compiler that converts values into sorted binary index files for consumption by Identity Fusion.
_Avoid_: connector plugin, customizer script, database driver package.

## Decisions

- **Context**: Identity Fusion evaluates unique attribute definitions during account generation. Populating reserved unique values (e.g., legacy IDs, reserved usernames) via regular managed account aggregation floods the V8 heap with hundreds of thousands of `Account` objects, causing memory exhaustion in cloud containers.
- **Q1: Where should the user data live?**
  - *Option A*: Embedded inside the core Fusion connector bundle. Rejected: requires rebuilding and redeploying the connector whenever tenant values change.
  - *Option B*: Standard SaaS customizer linked to the Fusion source instance. **Chosen**: decouples customer data updates from connector releases using native ISC `sail conn customizers` commands.
- **Q2: What is the optimal storage and query format on disk and memory?**
  - *Option A*: Parse raw JSONL/CSV during connector startup. Rejected: parsing 100k+ lines in JS creates string allocations and startup latency.
  - *Option B*: Bloom filters. Rejected: 0.1% false-positive rate can reject valid generated values.
  - *Option C*: Sorted 64-bit BigInt binary hash arrays (`.bin`). **Chosen**: 100,000 values consume only 800 KB of flat Buffer memory, binary search executes in ~50 nanoseconds, zero false positives, and zero V8 string allocations.
- **Q3: How does Fusion discover the customizer files?**
  - *Option A*: Hardcode container paths (e.g. `/var/task/customizer`). Rejected: fragile across platform updates.
  - *Option B*: Customizer's `beforeStdAccountList` hook passes `customizerIndicesDir` in `input`. **Chosen**: native `@sailpoint/connector-sdk` execution model where customizer and connector share the process and `input` object.
- **Q4: How should loaded values be audited?**
  - *Option A*: Silent loading. Rejected: operators cannot verify which attributes were loaded.
  - *Option B*: Structured log tracing. **Chosen**: emit `log.info` / `log.detail` records stating the indices directory, attribute names loaded, unique value counts, and load duration.

## Open questions

None. All material questions and architectural choices were resolved during discovery.

## Scenarios discussed

- **Empty or missing CSV file**: Build script handles empty CSVs cleanly without generating corrupt binary files.
- **Missing customizer linked**: Fusion runs standard uniqueness checks against live accounts without error if no customizer data is provided in `input`.
- **Case-sensitivity and whitespace**: Build script trims whitespace; case-sensitivity follows Identity Fusion's attribute transform pipeline.
- **Multiple unique attributes**: Multiple CSV files (`sAMAccountName.csv`, `employeeNumber.csv`) compile into distinct `.bin` files and load into respective attribute namespaces in `CustomizerValueStore`.
- **Hash collision handling**: 64-bit FNV-1a / xxHash provides a collision probability lower than $1 \times 10^{-11}$ across $10^6$ values, rendering collisions negligible.
