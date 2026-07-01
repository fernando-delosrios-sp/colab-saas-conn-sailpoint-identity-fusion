## Why

Currently, when managed accounts are aggregated and combined into a single Fusion account, the system records this as an "association" in the account history. This terminology is confusing because "association" often refers to different concepts in identity management. The term "blending" more accurately describes the process of merging multiple source accounts into one. Furthermore, while these blending events are logged, they are not surfaced in the aggregation report. Adding a dedicated "FUSION BLENDS" section to the report will provide clear, immediate visibility into which accounts were automatically merged during the aggregation, matching the level of detail currently provided for review decisions.

## What Changes

- **Terminology Update**: Rename "association" to "blending" across the codebase where it refers to absorbing managed accounts into a Fusion account (e.g., `addAssociationHistory`, `skipAssociationHistoryForManagedKeys`, and related logs/comments).
- **History Log Update**: Update the history message from `Associated managed account...` to `Blended managed account...`.
- **Report Data Collection**: Introduce tracking for blending events during `setManagedAccount` execution so they can be included in the report payload.
- **Report UI**: Create a new report section called "FUSION BLENDS" in the HTML email template (`helpers.ts`). This section will visually match the "FUSION REVIEW DECISIONS" layout, displaying details about the blended accounts.

## Capabilities

### New Capabilities
- `report-fusion-blends`: Defines the structure and generation of the new FUSION BLENDS section in the aggregation report.

### Modified Capabilities
- `account-blending`: Updates the terminology and tracking mechanism for absorbing managed accounts.

## Impact

- **Code**: Refactoring variable and method names in `fusionAccount.ts`, `decisionProcessor.ts`, `fusionService.ts`, and `fusionAccountMatcher.ts`.
- **Reporting**: Modifying the report payload structure (`types.ts`) and the Handlebars templates (`helpers.ts`, `locales.ts`, `update-i18n.js`).
- **Tests**: Updating test assertions that look for "association" or the previous history messages.
