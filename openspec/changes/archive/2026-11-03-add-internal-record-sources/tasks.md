## 1. Internal-record package format

- [x] 1.1 Define versioned manifest, shard framing, source-file identity, header metadata, and record-count types under `customizers/records/`.
- [x] 1.2 Add a standards-compliant streaming CSV compiler for headered internal-record dumps, with deterministic artifacts and source CSV exclusion from the package.
- [x] 1.3 Add build-time validation and actionable errors for malformed CSV, duplicate headers, unsupported format versions, and invalid configured files.
- [x] 1.4 Extend the customizer hook to expose internal-record package locations without changing the existing `customizerIndicesDir` behavior.
- [x] 1.5 Add compilation and artifact-reader tests for quoted values, embedded line breaks, empty cells, deterministic output, round trips, and index-only backward compatibility.

## 2. External Record source integration

- [x] 2.1 Extend Source Settings and configuration models with an explicit Internal Record source file reference and validation that preserves existing managed-source entries.
- [x] 2.2 Add manifest loading and Setup validation for configured Internal Record sources, including missing-file and incompatible-manifest errors before Fetch.
- [x] 2.3 Extend source metadata and discovery to create internal Record `SourceInfo` entries without ISC source discovery, source IDs, or id-index membership.
- [x] 2.4 Implement sequential internal-record shard fetch, managed-account normalization, referenced-attribute pruning, progress reporting, and work-queue registration without whole-file reads.
- [x] 2.5 Route Internal Record sources through existing Record Match and Match-disabled unique-registration paths; preserve non-contributing behavior and release claimed record bodies.
- [x] 2.6 Add configuration, discovery, stream-fetch, attribute-pruning, Match on/off, unmatched-record, and no-ISC-call tests.

## 3. Provenance and reports

- [x] 3.1 Add typed internal provenance to source, managed-account, Match candidate, review-decision, and report projection models without assigning ISC account IDs.
- [x] 3.2 Update Fusion processing and report account-link resolution to retain Internal Record provenance and omit unavailable ISC links.
- [x] 3.3 Add localized `INTERNAL` report label and render it beside the Record source-type badge in Fusion, aggregation, dry-run, and Fusion review views.
- [x] 3.4 Add report rendering tests proving Internal Record references show Record plus INTERNAL with no ISC link, while configured Record references do not show INTERNAL.

## 4. Runtime-memory measurement

- [x] 4.1 Add generated and anonymized representative internal-record fixtures plus a benchmark command that runs streaming CSV and compiled-artifact readers in separate processes.
- [x] 4.2 Capture package bytes, elapsed time, records per second, heap usage, external memory, RSS, and platform filesystem type when available.
- [x] 4.3 Add bounded-memory tests that assert sequential decoding and absence of full-dump/account-array retention; keep large performance data out of regular unit-test runs.
- [x] 4.4 Record benchmark fixture characteristics and representative results, explicitly documenting that ramfs storage is not a memory-saving spill layer.

## 5. Verification

- [x] 5.1 Confirm canonical test commands: `npm test`, `npm run test:scenario`, and `npm run lint`.
- [x] 5.2 Run focused customizer, source-service, fusion-service, report-service, and configuration tests covering every delta-spec scenario.
- [x] 5.3 Run the internal-record benchmark and retain its measurement report with the fixture description.
- [x] 5.4 Run `npm test`, `npm run test:scenario`, and `npm run lint`; resolve failures introduced by this change.

## 6. Documentation

- [x] 6.1 Update `docs/use-guides/configuration/records-customizer.md` with internal-record dump placement, compilation, manifest artifacts, and package compatibility.
- [x] 6.2 Update `docs/use-guides/configuration/source-types.md` and source-configuration guidance with Internal Record source selection, Record Match semantics, and INTERNAL report provenance.
- [x] 6.3 Update `docs/glossary.md` with Internal Record source, internal-record dump, and INTERNAL badge. Canonical ubiquitous-language merge stays in archive.
- [x] 6.4 Document benchmark use, ramfs constraints, package-size evidence, and missing/incompatible-package troubleshooting.
- [x] 6.5 Run `npm run lint:docs-guides`, `npm run lint:markdown`, and `npm run docs:prepare`.

## 7. Changelog

- [x] 7.1 Create or update the changelog entry for Internal Record sources through the changelog generator during apply.
- [x] 7.2 Confirm the entry covers customizer packaging, Record-source processing, report INTERNAL badges, and memory-measurement guidance.
