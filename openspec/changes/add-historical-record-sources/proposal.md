## Why

Historical accounts often exist only as export dumps, so they cannot enrich matching and unique-value registration without first being recreated as ISC-managed sources. The current Unique Values Customizer can reserve individual values but discards the record context required for Map, Define, Match, and operator reports. Packaging historical dumps as low-memory Record sources gives administrators that context while preserving a clear distinction from configured managed sources and avoiding a false assumption that the customizer runtime filesystem lowers memory use.

## What Changes

**Historical account ingestion**
- From: The customizer accepts only one-column value CSVs and configured Record sources must be discovered and fetched from ISC.
- To: A headered historical-record dump packaged with the customizer can be selected by file name as an external Record source and streamed into the existing Record processing path.
- Reason: Historical records can participate in enrichment without an ISC source copy.
- Impact: Additive configuration and customizer package format; existing managed sources retain their behavior.

**Record provenance in reports**
- From: Report references distinguish only Authoritative, Record, and Orphan source types.
- To: References originating from a Historical Record source retain the Record type and display an `INTERNAL` provenance badge.
- Reason: Operators must distinguish packaged records from configured managed sources.
- Impact: Additive report presentation and report-model metadata.

**Runtime storage validation**
- From: The customizer has compact hash indexes but no full-record format or measured ramfs behavior.
- To: Packaging produces a manifest-backed, stream-readable compiled record artifact and ships a repeatable benchmark/diagnostic that compares it to streaming CSV by package size, throughput, heap, external memory, and RSS.
- Reason: A ramfs can still consume the runtime memory budget; performance claims must be measured.
- Impact: New packaging validation and documented deployment constraints.

## Capabilities

### New Capabilities
- `historical-record-sources`: Package, configure, validate, and stream historical-record dumps as external Record sources, including bounded-memory instrumentation.

### Modified Capabilities
- `unique-values-customizer`: Extend the customizer artifact and hook contract to expose the historical-record manifest and compiled artifact alongside unique-value indexes.
- `source-service`: Discover and fetch configured Historical Record sources from customizer package data instead of ISC while preserving source filtering boundaries.
- `fusion-service`: Process Historical Record sources with Record semantics and preserve internal provenance.
- `report-service`: Present internal provenance for historical records in generated reports and review decisions.
- `ubiquitous-language`: Canonicalize Historical Record source, historical-record dump, and INTERNAL badge.
- `documentation-site`: Document package construction, Source Settings, runtime memory limits, and report interpretation.

## Impact

- Customizer project: `customizers/unique-ids/` gains CSV compilation, manifest/artifact loading, fixtures, benchmark tooling, and package documentation.
- Connector configuration and models: Source Settings, source discovery/fetching, pipeline options, and source provenance must accept an external Record source reference without treating it as an ISC source.
- Aggregation: historical records flow through Map, Define, Record unique registration, and the existing optional Record Match path, with pruning and depletion retained.
- Reporting: Fusion and review report models/templates/locales gain an additive INTERNAL badge.
- Validation: unit, integration, scenario, and benchmark tests must cover CSV correctness, missing or incompatible package data, Match on/off, reporting provenance, and memory measurements.
