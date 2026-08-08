## 1. Remove raw-ID normalization fallbacks

- [x] 1.1 Update `candidateRegistry.candidateKey` to use composite key only (remove `?? originAccount` fallback)
- [x] 1.2 Update `correlationManager` assigned-key resolution to composite-only
- [x] 1.3 Update `formInstanceAnalyzer.extractAccountIdFromInstance` to composite-only
- [x] 1.4 Update `formService` account ID normalization to composite-only
- [x] 1.5 Update `FusionAccount.applyOriginMetadata` for context-sensitive originAccount validation (identity ID vs composite key)
- [x] 1.6 Audit remaining `normalizeCompositeManagedAccountKey(x) ?? x` patterns in production code and remove

## 2. Account-read rebuild path

- [x] 2.1 Update `rebuildFusionAccount.parseManagedAccountKeys` log message to invalid-key wording (remove "legacy" framing)
- [x] 2.2 Update `rebuildFusionAccount.test.ts` — rename scenario and assert new warning text
- [x] 2.3 Add test: composite keys still fetched; invalid keys skipped without failing read

## 3. Fusion account reconstruction

- [x] 3.1 Add/update tests verifying non-composite `accounts` values are dropped during `fromFusionAccount`
- [x] 3.2 Add/update tests verifying non-composite `missing-accounts` values are dropped
- [x] 3.3 Add tests for `originAccount` — identity ID retained for Identities origin; raw UUID rejected for managed origin

## 4. Schema attribute descriptions

- [x] 4.1 Update `fusionAccountSchemaAttributes` descriptions in `src/data/schema.ts` for `accounts`, `missing-accounts`, `originAccount`
- [x] 4.2 Update or add schema contract test if descriptions are asserted — N/A, descriptions not asserted in schema.test.ts

## 5. Regression and lint

- [x] 5.1 Run targeted tests: `managedAccountKey.test.ts`, `rebuildFusionAccount.test.ts`, `formProcessor.test.ts`, fusion account tests
- [x] 5.2 Run `npm run lint`

## 6. Documentation

- [x] 6.1 Update `docs/reference/standard-account-schema.md` — remove legacy raw ID backwards-compatibility prose from `accounts`, `missing-accounts`, `originAccount` rows
- [x] 6.2 Update inline JSDoc on `rebuildFusionAccount.parseManagedAccountKeys` if it references legacy compatibility
- [x] 6.3 N/A — README unchanged (no user-facing mention of legacy raw IDs found)

## 7. Changelog

- [x] 7.1 Create or update changelog entry noting breaking removal of legacy raw managed account ID support on schema attributes
- [x] 7.2 Confirm entry covers migration guidance (patch attributes to composite keys before upgrade)
