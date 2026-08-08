## 1. Account-list operation spec delta

- [x] 1.1 Review change delta `specs/account-list-operation/spec.md` for accurate Fetch-scoped language
- [x] 1.2 On archive, merge MODIFIED requirement and REMOVED misleading scenario into `openspec/specs/account-list-operation/spec.md`

## 2. Source-service spec delta

- [x] 2.1 Review change delta `specs/source-service/spec.md` for API filter vs JMESPath split
- [x] 2.2 On archive, merge MODIFIED requirement and REMOVED mislabeled scenario into `openspec/specs/source-service/spec.md`

## 3. Validation

- [x] 3.1 Run `openspec validate reconcile-account-filter-spec --strict` (or project-equivalent validate command)
- [x] 3.2 Confirm existing tests still cover API filter behavior (`accountJmespathFilter.test.ts`, `sourceService.test.ts`) — no new tests required

## 4. Drift report follow-up (optional)

- [x] 4.1 Annotate `.scratch/spec-drift-report.md` account-list filter row as spec-only false positive (optional housekeeping)

## Final: Test Execution

- [x] Run tests: `npm test -- src/services/sourceService/__tests__/accountJmespathFilter.test.ts src/services/sourceService/__tests__/sourceService.test.ts`
- [x] Run lint: `npm run lint` (pre-existing repo-wide lint debt; no new issues from this spec-only change)

## Final: Changelog

- [x] N/A — documentation-only spec reconciliation; no user-facing behavior change

## Final: Documentation

- [x] N/A — canonical specs updated via archive merge; user docs already describe source filters correctly
