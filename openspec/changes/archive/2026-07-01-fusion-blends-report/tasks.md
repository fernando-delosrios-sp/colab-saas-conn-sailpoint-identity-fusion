## 1. Terminology Update

- [x] 1.1 Rename `addAssociationHistory` to `addBlendHistory` in `fusionAccount.ts` and update related comments.
- [x] 1.2 Rename `skipAssociationHistoryForManagedKeys` to `skipBlendHistoryForManagedKeys` in `fusionAccount.ts`.
- [x] 1.3 Update references to these fields in `decisionProcessor.ts`, `fusionService.ts`, and `fusionAccountMatcher.ts`.
- [x] 1.4 Update the actual string pushed to history from `Associated managed account...` to `Blended managed account...` in `fusionAccount.ts`.

## 2. Tracking Blends

- [x] 2.1 Add `fusionBlends?: FusionReportBlend[]` to the `FusionReport` interface in `types.ts`, and define `FusionReportBlend` type with `accountName`, `accountUrl`, `blendedAccountName`, `blendedSource`.
- [x] 2.2 In `fusionService.ts`, define `fusionBlends: FusionReportBlend[] = []` on the tracker (or `FusionTracker` type if strictly typed).
- [x] 2.3 Modify `fusionAccountMatcher.ts` or `fusionAccount.ts` to push an event object into `tracker.fusionBlends` whenever a managed account is absorbed and `recordAssociationHistory` is true. Note: To keep `fusionAccount.ts` decoupled from reporting, it might be better to return a boolean from `setManagedAccount` or do the tracking in `fusionService.ts` / `fusionAccountMatcher.ts` where the `tracker` is available.

## 3. Reporting HTML Updates

- [x] 3.1 Update `locales.ts` and `update-i18n.js` to add localized strings for `fusion_blends` (e.g., "Fusion Blends").
- [x] 3.2 Update `fusion-report.hbs` to conditionally display a "FUSION BLENDS" table using the `fusionBlends` array, styling it identically to `fusionReviewDecisions` but without the reviewer details and spacing adjusted.
- [x] 3.3 Add `fusionBlends` from the tracker into the final generated `FusionReport` object in `fusionService.ts` (`generateReport()`).

## 4. Testing

- [x] 4.1 Search `src/services/fusionService/__tests__` for "association" or "Associated managed account" and update all corresponding unit tests to use the new "blending" terminology.
- [x] 4.2 Verify the build and tests succeed (`npm run build`, `npm test`).
