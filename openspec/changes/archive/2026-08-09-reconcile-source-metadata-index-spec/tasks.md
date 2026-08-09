## 1. Living spec updates — fusion-run

- [x] 1.1 Merge `openspec/changes/reconcile-source-metadata-index-spec/specs/fusion-run/spec.md` delta into `openspec/specs/fusion-run/spec.md` (MODIFIED inventory ownership requirement; ADDED metadata tiers requirement)
- [x] 1.2 Verify living spec documents: id-index exception, managed-only post-identity `sourcesByName`, name-only snapshot contract

## 2. Living spec updates — source-service

- [x] 2.1 Merge source-service delta into `openspec/specs/source-service/spec.md` (ADDED discovery-session indexes; MODIFIED account write requirement to separate account vs source metadata)
- [x] 2.2 Verify living spec documents `sourcesById`, `_allSources`, and `getSourceByName` → `run.sourcesByName` read path

## 3. Validation and audit

- [x] 3.1 Run `openspec validate --all --json` — every item `"valid": true`
- [x] 3.2 Ripgrep living specs: dual-index pattern and managed-only post-reviewer-init lifecycle documented
- [x] 3.3 Confirm `.scratch/spec-drift-report.md` SourceService parallel map row can be marked resolved (optional manual update)

## 4. Documentation

- [x] 4.1 Update README / getting-started — N/A (no user-visible connector behavior change); mark complete with reason
- [x] 4.2 Update API / connector docs — N/A (internal architecture docs only via OpenSpec); mark complete with reason
- [x] 4.3 Update inline docs (JSDoc) — N/A unless stale comments claim SourceService must not hold `sourcesById`; if found, align comments to spec

## 5. Changelog

- [x] 5.1 Create or update changelog entry noting spec reconciliation for source metadata indexing (no release behavior change)
- [x] 5.2 Confirm entry states spec-only alignment; no connector behavior change
