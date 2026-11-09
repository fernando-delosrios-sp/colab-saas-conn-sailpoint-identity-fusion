## Context

Identity Fusion NG generates unique attribute values (such as usernames, IDs, and email addresses) using Velocity templates and collision-resolution strategies. When deploying Fusion alongside legacy systems or maintaining pools of reserved values (e.g., pre-reserved usernames, active directory prefixes, or historical employee IDs), administrators must prevent Fusion from issuing any values in those reserved pools.

Currently, registering existing values requires either:
1. Aggregating those values through a managed "Record" source, which queries ISC APIs and allocates full `Account` objects in the V8 heap, causing Out Of Memory (`JavaScript heap out of memory`) crashes in SaaS containers for large datasets (100k+ records).
2. Hardcoding values in the connector bundle, requiring full rebuilds and redeployments of the connector codebase whenever reserved values change.

This design provides a zero-heap, decoupled solution utilizing the SailPoint SaaS Connectivity customizer framework.

## Goals / Non-Goals

**Goals:**
- Enable tenant administrators to maintain single-column CSV files of reserved values per unique attribute in a standalone customizer project without touching connector code.
- Pre-compile CSVs into sorted 64-bit BigInt binary hash arrays (`.bin`) at packaging time (`pack-zip`) to minimize file size and avoid runtime parsing.
- Provide a `CustomizerValueStore` in Fusion that loads binary buffers and performs sub-microsecond in-memory binary search (`O(log N)`), with zero V8 string allocations.
- Pass the customizer index directory dynamically to Fusion via the native `beforeStdAccountList` hook.
- Emit structured log traces during aggregation detailing the customizer directory, loaded attribute names, indexed value counts, and load timings.

**Non-Goals:**
- Supporting multi-attribute or relational records in the customizer (this is strictly for unique attribute value existence checking).
- Modifying or writing back to the customizer files at runtime (the store is strictly read-only).
- Downloading files dynamically from external cloud object storage (S3/GCS/Azure Blob) at runtime.

## Decisions

### D1: Pre-compiled Sorted 64-bit Binary Hash Index
- **Choice**: Compile lines in `<attr>.csv` into sorted 64-bit BigInt integers written to `<attr>.bin`. At runtime, Fusion wraps the buffer in a `BigInt64Array` and executes binary search.
- **Reason**: 100,000 values consume only 800 KB of flat Buffer memory. Binary search takes ~50 nanoseconds with 0 string allocations. 64-bit hash collision risk is $< 10^{-11}$.
- **Considered alternatives**:
  - *Raw CSV/JSONL parsing at runtime*: Rejected due to high memory consumption, GC pressure, and startup delay.
  - *Bloom filter*: Rejected due to false-positive risk (0.1% chance of erroneously rejecting a valid generated username).

### D2: Dynamic Customizer Location Handshake via `beforeStdAccountList`
- **Choice**: The customizer defines a lightweight `beforeStdAccountList` hook that resolves its local data directory (`path.resolve(__dirname, 'data')`) and returns it on `input.customizerIndicesDir`.
- **Reason**: In `@sailpoint/connector-sdk`, the customizer and connector share the exact same Node.js execution process, and the object returned by `beforeStdAccountList` replaces `input` for `stdAccountList`. This avoids fragile guessing of container mount paths.
- **Considered alternatives**:
  - *Scanning arbitrary disk paths*: Fragile across container environments and OS layouts.
  - *Custom connector configuration settings*: Requires manual path configuration in the ISC UI.

### D3: DefinitionService Query Priority
- **Choice**: In `DefinitionService.isCandidateValueUnique`, check `customizerValueStore.has(attributeName, candidate)` before checking the in-memory `Set<string>` populated by live accounts.
- **Reason**: Fast binary search returns immediately if the candidate matches a pre-compiled reserved value, short-circuiting downstream evaluation.
- **Considered alternatives**:
  - *Hydrating customizer values into `this.uniqueValuesByAttribute` Set*: Rejected because populating a JS `Set<string>` with 100k+ strings defeats the goal of zero heap accumulation.

### D4: Hash Function Algorithm
- **Choice**: Use a consistent 64-bit hash algorithm (64-bit FNV-1a implemented in pure TypeScript/BigInt).
- **Reason**: Zero external native dependencies, deterministic across platforms, and native `BigInt` operations in Node 24.
- **Considered alternatives**:
  - *xxHash64 (via native binding)*: Native C/C++ bindings fail during cross-compilation in serverless container environments.
  - *Crypto SHA-256 truncated*: Slower than FNV-1a BigInt arithmetic for millions of values.

## Risks / Trade-offs

- **[Risk]** User provides an attribute CSV whose name does not match any configured Unique attribute definition.
  -> **Mitigation**: `CustomizerValueStore` loads all available `.bin` files and logs them. If a file does not match a configured unique attribute, it is simply ignored during candidate generation, with a detail log noting unmatched index files.
- **[Risk]** Customizer package is not attached or directory does not exist.
  -> **Mitigation**: Fusion treats `customizerIndicesDir` as optional. If absent or empty, Fusion logs a debug message and proceeds with standard in-memory uniqueness checks with no error.
- **[Trade-off]** Read-only static reserved values; updates require re-uploading the customizer zip.
  -> **Reason for acceptance**: Acceptable because reserved value pools (legacy IDs, reserved usernames) change infrequently compared to account aggregation runs.

## Migration Plan

N/A — This change is backward-compatible. Connectors running without a linked customizer continue normal operation with zero behavioral changes.

## Open Questions

None.
