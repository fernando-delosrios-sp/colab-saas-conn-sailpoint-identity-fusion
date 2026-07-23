## 1. Configuration layer

- [x] 1.1 Add `scoringMaxConcurrency: 12` to `connectorSpecInitialValues` and `runtimeDefaults` in `src/data/config/settings/developerSettings.ts`
- [x] 1.2 Parse `scoringMaxConcurrency` in `readSettings()` with fallback to runtime default
- [x] 1.3 Add `scoringMaxConcurrency?: number` to `DeveloperSettingsSection` in `src/model/config.ts`
- [x] 1.4 Add `scoringMaxConcurrency` developer setting to `connector-spec.json` (type number, default 12, description of CPU/memory trade-off)

## 2. Concurrency helper

- [x] 2.1 Add `getScoringMaxConcurrency(config: FusionConfig): number` to `src/services/fusionService/collections.ts` — clamp to `[1, 50]`
- [x] 2.2 Add unit test for `getScoringMaxConcurrency` in `src/services/fusionService/__tests__/collections.test.ts` (default, clamp low, clamp high)

## 3. Apply capped scoring in match outcome dispatch

- [x] 3.1 Import `promiseAllBatched` and `getScoringMaxConcurrency` in `src/services/matchingService/matchOutcomeDispatcher.ts`
- [x] 3.2 Resolve `scoringConcurrency = max(1, min(batchSize, getScoringMaxConcurrency(config)))` at start of `scoreManagedAccounts`
- [x] 3.3 Replace identity-phase `Promise.all(batch.map(...))` with `promiseAllBatched(batch, scoreIdentityCandidates, scoringConcurrency)`
- [x] 3.4 Replace deferred-phase `Promise.all(batch.map(...))` with `promiseAllBatched` using same concurrency cap

## 4. Tests and verification

- [x] 4.1 Add or extend test in `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` verifying batch of 50 with `scoringMaxConcurrency=5` completes all accounts
- [x] 4.2 Run `npm run typecheck`, `npm test`, and `npm run lint`
- [x] 4.3 Eye-check: no bare `Promise.all` remains in scoring loops inside `scoreManagedAccounts`

## 5. Documentation

- [x] 5.1 Verify `connector-spec.json` description clearly states default 12 and that higher values increase CPU/memory
- [x] 5.2 Add brief JSDoc on `getScoringMaxConcurrency` noting relationship to fusion parallel cap (12) and independence from `managedAccountsBatchSize`
