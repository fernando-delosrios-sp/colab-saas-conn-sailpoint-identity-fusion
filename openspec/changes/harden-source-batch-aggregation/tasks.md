## 1. Source Account Query Sorting

- [x] 1.1 Update `fetchAccountsBySourceIdGenerator` in `src/services/sourceService/sourceService.ts` to conditionally use `sorters = sourceInfo.config?.accountLimit != null ? 'created,id' : 'id'`
- [x] 1.2 Update `fetchAccountsBySourceId` in `src/services/sourceService/sourceService.ts` to conditionally use `sorters = sourceInfo.config?.accountLimit != null ? 'created,id' : 'id'`
- [x] 1.3 Update existing unit tests in `src/services/sourceService/__tests__/sourceService.test.ts` to verify `sorters: 'created,id'` when `accountLimit` is present, and `sorters: 'id'` when absent

## 2. Cumulative State & Monotonicity

- [x] 2.1 Update `fetchManagedAccounts` in `src/services/sourceService/managedAccountFetcher.ts` to enforce monotonic updates: `batchCumulativeCount[source.name] = Math.max(batchCumulativeCount[source.name] ?? 0, collectedCount)`
- [x] 2.2 Add unit tests in `src/services/sourceService/__tests__/` verifying `batchCumulativeCount` does not decrease when a fetch returns fewer accounts than previously recorded

## 3. Creation Watermark Timestamp

- [x] 3.1 Update `FusionConfig` and `ConnectorAttributes` in `src/model/config.ts` to support `batchWatermarkTimestamp?: Record<string, string>`
- [x] 3.2 In `managedAccountFetcher.ts`, capture the newest account creation timestamp (`account.attributes.created` or `account.created`) and record it in `batchWatermarkTimestamp`
- [x] 3.3 Add methods in `SourceService` to persist and reset `batchWatermarkTimestamp` alongside `batchCumulativeCount`

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test`
- [x] 4.2 All delta spec scenarios covered by automated tests in `src/services/sourceService/__tests__/`

## 5. Documentation

- [x] 5.1 Remove the static-dataset limitation and skipping warning in `docs/use-guides/configuration/configuring-sources-and-scope.md`
- [x] 5.2 Reframe **Aggregation batch size** as a Progressive Onboarding Ramp in `docs/glossary.md` and `openspec/specs/ubiquitous-language/spec.md`
- [x] 5.3 Update JSDoc comments in `src/model/config.ts` and `src/services/sourceService/managedAccountFetcher.ts`

## 6. Changelog

- [x] 6.1 Create changelog entry via `changelog-generator` skill
- [x] 6.2 Confirm entry covers conditional `created,id` sorting, monotonic cumulative count, watermark timestamp, and doc updates
