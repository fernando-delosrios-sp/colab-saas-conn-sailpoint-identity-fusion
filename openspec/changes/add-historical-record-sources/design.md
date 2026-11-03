## Context

The Unique Values Customizer currently converts one-column CSV files into in-memory binary hash indexes. It can reject duplicate generated values but cannot provide account context to Map, Define, Match, or reports. Record sources already provide those semantics, but discovery only accepts configured ISC managed sources and fetches their accounts through the Accounts API.

Historical exports need to join that pipeline without masquerading as ISC sources. The deployment filesystem may be ramfs, so using it as a spill area does not reduce the runtime memory budget. The design must stream and prune records while measuring memory behavior honestly.

## Goals / Non-Goals

**Goals:**
- Package headered historical-record dumps as deterministic, validated, stream-readable customizer artifacts.
- Configure the dump by file name as an external Record source with the existing Record Match toggle.
- Preserve source provenance through Match, review, and report models, rendered as an INTERNAL badge.
- Bound JavaScript object retention through streaming, referenced-attribute pruning, and normal work-queue depletion.
- Produce reproducible package, throughput, and memory evidence for the selected record format and runtime filesystem.

**Non-Goals:**
- Replacing, synchronizing, or modifying configured ISC managed sources.
- Treating ramfs files as a memory-saving persistence tier.
- Loading a whole historical dump, CSV string, or parsed account collection into memory.
- Changing Authoritative, Orphan, or unique-value hash-index semantics.

## Decisions

### D1: Use a manifest-backed compiled historical-record artifact
- **Choice**: The customizer build parses headered CSV streams and emits a versioned manifest plus deterministic binary record shards. The manifest maps the administrator-visible CSV file name to its source identity, schema/header metadata, shard locations, record count, and format version. The packaged CSV is omitted after compilation.
- **Reason**: The connector requires explicit source-to-artifact resolution, schema validation, repeatable packaging, and sequential streaming without keeping a large CSV string or an object array.
- **Considered alternatives**: Runtime CSV parsing keeps deployment simple but repeats expensive parsing and leaves the original data in the package. NDJSON is easy to stream but repeats keys for every row and has higher package and parse costs. A database file adds a native/runtime dependency and still consumes memory on ramfs.
- **Measured result**: On the local 5,000-row APFS fixture, length-prefixed shards are larger than the source CSV and read at a similar rate. The compiled artifact remains the packaged form because it validates the dump once, omits the CSV, and streams one record at a time. The benchmark records that comparison and does not treat ramfs as a memory saving.

### D2: Treat historical sources as external Record sources
- **Choice**: Add an explicit source configuration reference to a historical-record file. Discovery creates `SourceInfo` metadata with Record type and internal provenance from the manifest; it bypasses ISC lookup and id indexes. Fetch streams shard records into the same pruned managed-account work queue used for configured Record sources.
- **Reason**: Existing Record behavior already defines non-authoritative matching, unique registration, and Match opt-out. Explicit provenance avoids overloading the Fusion source or falsely creating ISC IDs.
- **Considered alternatives**: Synthetic ISC sources make report links and discovery incorrect. A new source type would duplicate Record processing and change operator configuration semantics.

### D3: Preserve a separate internal-provenance marker
- **Choice**: Add an internal provenance field to source/account/report data. Render `INTERNAL` next to the normal Record type label wherever the source reference is shown; never create ISC account links for internal records.
- **Reason**: `Record` describes processing behavior, while `INTERNAL` describes where the data came from. Both are needed to interpret a result.
- **Considered alternatives**: Replacing Record with a new source type loses existing behavior and report grouping. A source-name convention is fragile and invisible to typed report code.

### D4: Stream, prune, and deplete full records
- **Choice**: Decode one shard frame at a time, normalize the record into the managed-account shape, apply the referenced attribute set before registration, and release it through existing Record and Fusion work-queue depletion paths. Match Candidate Records and report projections remain the only retained account representations needed later.
- **Reason**: This bounds JavaScript heap independently of dump size. File pages can still affect RSS on ramfs, so the design avoids a second full-data copy.
- **Considered alternatives**: Reading an artifact with `readFileSync`, preloading a Map, or retaining raw CSV for diagnostics would materialize the entire dump and increase heap/RSS.

### D5: Make format and ramfs claims measurable
- **Choice**: Add a benchmark command with generated and representative anonymized fixtures. It runs streaming CSV and compiled-shard readers in separate processes, samples `process.memoryUsage()` (heap used/total, external, RSS), elapsed time, records per second, and package bytes, and reports filesystem type when the platform exposes it. CI validates correctness and bounded-memory invariants; performance thresholds are documented from representative runtime measurements.
- **Reason**: The filesystem can be ramfs, where disk-backed-looking pages remain charged to memory. Environment-specific limits cannot be guessed from unit tests.
- **Considered alternatives**: Declaring a format optimal without data is unsupported. A single heap measurement omits Buffer/external memory and RSS. A large unit-test fixture risks unstable CI without adding representative evidence.

## Risks / Trade-offs

- [Binary compatibility] Format changes can make old customizer packages unreadable -> Mitigation: manifest format versioning and explicit unsupported-version errors.
- [CSV ambiguity] Historical exports may have quoting, embedded line breaks, duplicate headers, or missing identifiers -> Mitigation: use a standards-compliant streaming parser, retain manifest header metadata, and fail package build with file/row diagnostics.
- [ramfs RSS] Reading a large compiled artifact can still increase container RSS -> Mitigation: sequential shard streaming, no whole-file reads, benchmark RSS and filesystem characteristics, document tested limits.
- [Report links] Internal records have no ISC account ID -> Mitigation: render provenance and source name without an ISC link, while retaining existing links for configured accounts.
- [Configuration validation] A source file may be renamed or omitted from a package -> Mitigation: validate the configured reference and headers during Setup before Fetch.

## Migration Plan

1. Preserve the current `values/` hash-index path and hook field unchanged.
2. Add historical-record directories, manifest output, and a separate hook field so packages without dumps remain compatible.
3. Add optional source configuration. Existing Sources entries continue to resolve through ISC.
4. Validate the packaged manifest and historical source entries during Setup; fail before aggregation if unavailable or incompatible.
5. Deploy a rebuilt customizer with the connector version that understands its manifest format. Roll back by removing the historical source configuration and using the previous package; no tenant data migration is required.

Acceptance requires compilation and stream round-trip correctness, Match on/off behavior, internal report badges, absence of ISC account links for internal records, bounded-memory fixture assertions, benchmark output, and `npm run lint`, focused tests, and relevant scenario tests passing.

## Open Questions

- Exact benchmark fixture size and acceptance thresholds are environment-specific. The implementation records them with the benchmark results and documentation; it must not claim filesystem spill lowers memory solely from local results.
