## 1. Spec updates (spec-first)

- [x] 1.1 Apply delta spec to `openspec/specs/account-list-operation/spec.md` ✓
- [x] 1.2 Remove `openspec/specs/custom-dryrun-operation/spec.md` ✓
- [x] 1.3 Apply delta spec to `openspec/specs/ubiquitous-language/spec.md` ✓
- [x] 1.4 Apply delta spec to `openspec/specs/report-service/spec.md` ✓
- [x] 1.5 Sync `docs/concepts/glossary.md` with updated ubiquitous-language spec ✓

## 2. Deepen the operation-run module

- [x] 2.1 Create RunDescriptor type ✓
- [x] 2.2 Merge PipelineMode + OperationContext into RunDescriptor; delete both ✓
- [x] 2.3 Make phase functions private; delete targetPhase ladder ✓
- [x] 2.4 Replace PipelineRunner.run with executeRun ✓
- [x] 2.5 Gate phases on descriptor.persistence instead of mode.kind ✓
- [x] 2.6 Update fetchAndProcessForReport to use executeRun with stopAfter ✓
- [x] 2.7 Replace OperationContext consumers with boolean flags ✓

## 3. Add dryRun input to accountList

- [x] 3.1 Extend input with dryRun object ✓
- [x] 3.2 Parse dryRun input; construct descriptor ✓
- [x] 3.3 Dry-run gates: skip lock, reset, reverse-correlation, aggregation, form cleanup, save state ✓
- [x] 3.4 Build and res.send terminal summary ✓
- [x] 3.5 saveFile delegation to reportService ✓
- [x] 3.6 sendEmail delegation to reportService ✓

## 4. Delete dryRun command and helpers

- [x] 4.1 Remove custom:dryrun from index.ts ✓
- [x] 4.2 Remove custom:dryrun from connector-spec.json ✓
- [x] 4.3 Delete dryRun.ts ✓
- [x] 4.4 Delete dryRunHelpers.ts ✓
- [x] 4.5 Delete buildDryRunPayload.ts ✓
- [x] 4.6 Delete dryRun.test.ts ✓
- [x] 4.7 Delete dryRunHelpers.test.ts ✓
- [x] 4.8 Delete buildDryRunPayload.test.ts ✓
- [x] 4.9 Remove harness mock entries ✓
- [x] 4.10 Delete OperationContext enum ✓

## 5. Update report service

- [x] 5.1 writeAndSendDryRunReport accepts saveFile/sendEmail directly ✓
- [x] 5.2 Remove setDryRunRuntimeOptions + dryRunRuntimeOptions field ✓
- [x] 5.3 Clean up stale dry-run type/method references ✓
- [x] 5.4 Hardcode includeNonMatches: false in initializeDryRunReport ✓

## 6. Update downstream consumers

- [x] 6.1 fusionService.ts: OperationContext → shouldCaptureReportData boolean ✓
- [x] 6.2 accountAssembly.ts: OperationContext → isAggregationMode boolean ✓
- [x] 6.3 serviceRegistry.ts: derive boolean flags from handler name ✓
- [x] 6.4 Full test suite passes — no regressions ✓

## 7. Rewrite tests

- [x] 7.1 Rewrite corePipeline.test.ts for executeRun interface ✓
- [x] 7.2 Add dry-run mode scenarios to accountList.test.ts ✓
- [x] 7.3 Remove stale harness mocks ✓
- [x] 7.4 Update generateReport.test.ts for executeRun ✓

## 8. Documentation

- [x] 8.1 Rewrite README.md "Custom command: custom:dryrun" → "Dry-run mode" ✓
- [x] 8.2 Delete docs/operations/custom-dryrun.md ✓
- [x] 8.3 Update docs/guides/match.md — replace custom:dryrun references ✓
- [x] 8.4 Generate CHANGELOG.md entry ✓

## 9. Final verification

- [x] 9.1 npm run build — clean ✓
- [x] 9.2 npm test — 971 pass, 0 fail ✓
- [x] 9.3 npm run lint — clean (pre-existing issues only) ✓
- [ ] 9.4 Verify custom:dryrun references removed from production code ✓ (remaining in comments only)
