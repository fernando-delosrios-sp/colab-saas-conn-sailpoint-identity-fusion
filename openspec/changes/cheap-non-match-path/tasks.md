## 1. MatchingService captureBreakdown state

- [x] 1.1 Add `private _captureBreakdown = false` and `public setCaptureBreakdown(value: boolean): void` to `MatchingService`
- [x] 1.2 In `scoreFusionAccount`, derive `captureBreakdown = this._captureBreakdown || candidateType !== MatchCandidateType.Identity` and pass to `compareFusionAccounts`

## 2. Refactor compareFusionAccounts fast path

- [x] 2.1 Add `captureBreakdown: boolean` parameter to `compareFusionAccounts`
- [x] 2.2 Implement fast-path loop branch: update `weightedSum`, `weightTotal`, `hasFailedMandatory` only — no `ScoreReport` allocation
- [x] 2.3 Preserve full-path branch with existing `scores.push` / skipped-report padding logic when `captureBreakdown` is true
- [x] 2.4 When fast path finds `combinedPasses`, re-run with `captureBreakdown = true` to build and store `FusionMatch` with full breakdown
- [x] 2.5 Ensure `weightedScore` assignment (lines 497-503) runs only in full-path / post-pass breakdown mode

## 3. Wire FusionService initialization

- [x] 3.1 In `FusionService.initializeManagedAccountProcessing`, call `this.matchingService.setCaptureBreakdown(this.shouldCaptureReportData)` after trigram index build (or at end of init)

## 4. Tests and verification

- [x] 4.1 Add test in `src/services/matchingService/__tests__/matchingService.test.ts`: `captureBreakdown = false`, non-matching account → zero matches stored (behavior unchanged)
- [x] 4.2 Add test: threshold-passing comparison with `captureBreakdown = false` → match stored with complete `scores` array
- [x] 4.3 Run `npm run typecheck`, `npm test`, and `npm run lint`

## 5. Documentation

- [x] 5.1 Add JSDoc on `setCaptureBreakdown` explaining run-scoped flag and interaction with deferred candidate type
- [x] 5.2 Add brief comment on fast-path re-run trade-off in `compareFusionAccounts`
