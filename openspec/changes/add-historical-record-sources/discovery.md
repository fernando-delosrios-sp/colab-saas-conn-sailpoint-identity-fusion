## Scope

Add packaged historical CSV dumps as external Record sources to the Unique Values Customizer, process them with existing Record-source semantics, distinguish their report references with an INTERNAL badge, and establish the lowest-memory practical packaged format through repeatable benchmarks; changing ISC-managed source behavior is out of scope.

## Language

**Historical Record source** (`promote`):
An external Record source packaged with the Unique Values Customizer from a named historical-record dump, rather than fetched from an ISC managed source.
_Avoid_: internal source, CSV source, source record

**Historical-record dump** (`promote`):
A headered CSV file containing complete historical account records that is compiled during customizer packaging and identified by its configured file name.
_Avoid_: values CSV, raw account, managed row

**INTERNAL badge** (`promote`):
The report badge attached to a reference whose managed account originated from a Historical Record source, distinguishing it from configured managed sources.
_Avoid_: internal source type

**Record source** (`draft`):
The existing canonical Record source remains an enrichment-only source type. Historical Record sources use its Map, Define, unique-attribute registration, and optional Match behavior.
_Avoid_: authoritative source

**Customizer Value Store** (`draft`):
The existing hash-index store remains limited to compact uniqueness lookups. It is not the storage format for full historical records.
_Avoid_: historical record store

## Decisions

- Historical-record dumps are an opt-in external counterpart to configured Record sources. Administrators select the packaged CSV file name as the source reference; this does not require a same-named ISC source to exist.
- Historical Record sources inherit the Record-source default of participating in Match. Administrators can disable Match through the existing **Include record accounts in Match** setting, retaining selective Map and unique-attribute registration behavior.
- The report model identifies each historical record as internal provenance, independently of the normal Record source-type label. Account and review references display the `INTERNAL` badge so operators can distinguish packaged data from configured managed sources.
- The customizer build consumes headered CSV safely, validates the selected source files and headers, and emits a versioned manifest plus a compact, stream-readable record artifact. The original CSV is excluded from the deployable output.
- A ramfs offers no durable-memory escape: its file pages count toward runtime memory. The format choice therefore optimizes package bytes, JavaScript heap, resident-memory growth, parse throughput, and lookup/report fidelity rather than assuming disk spill reduces RAM.
- The implementation includes a representative-data benchmark and a runtime filesystem/memory diagnostic. The benchmark compares the raw CSV streaming baseline with the compiled format, records Node heap/external/RSS deltas and elapsed time, and fails acceptance only when the compiled format regresses agreed thresholds. Production account processing streams and prunes records rather than retaining full dumps or account objects.

## Open questions

- Resolved: the report badge applies to every displayed reference to a Historical Record source, including account-source cells and review decisions.
- Resolved: the source is internally packaged but follows the existing Record source configuration and Match toggle.
- Deferred to benchmark design: exact size and latency thresholds, which depend on a representative customer dump and the deployed customizer runtime limits. The implementation must publish fixture characteristics and measured results rather than claim that ramfs lowers memory.

## Scenarios discussed

- A package contains `Historical Records.csv`; a configured Historical Record source names that file, and the connector processes its records without discovering an ISC source with that name.
- The file includes quoted commas, line breaks, empty cells, and duplicate records; compilation preserves CSV semantics and produces deterministic output.
- A historical record matches an identity; its report reference retains the Record label and has an INTERNAL badge.
- A historical record does not match while Match is enabled; it follows existing Record non-match behavior and does not create a Fusion account.
- Match is disabled for a Historical Record source; the pipeline selectively maps unique-definition inputs, registers unique attributes, and releases the record without Match scoring.
- A configured historical file is missing, malformed, or has incompatible headers; setup fails with an actionable error before aggregation processes accounts.
- A large dump runs on ramfs; instrumentation demonstrates bounded per-record JavaScript heap usage and does not represent filesystem storage as a memory-saving spill mechanism.
