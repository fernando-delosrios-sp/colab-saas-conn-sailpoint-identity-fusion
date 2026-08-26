## 1. FusionRun observability (TDD)

- [x] 1.1 Add `identityComparisonCount` and `identityCandidateSetSizeSum` on FusionRun, initialized to 0; cover in `fusionRun.test.ts` (scenarios: Counter starts at zero).
- [x] 1.2 Increment `fullScanFallbackCount` whenever `getCandidates` returns `undefined`; do not increment for empty-set mandatory-missing; test JW-only mandatory returns undefined and increments (scenarios: Undefined getCandidates increments the counter; Counter accumulates across multiple accounts).
- [x] 1.3 Accumulate `identityComparisonCount` from identity-phase `compareFusionAccounts` only (not deferred).
- [x] 1.4 Accumulate `identityCandidateSetSizeSum`: `|Set|` including empty (empty adds 0); baseline size when pool is `undefined`.

## 2. Algorithm-aware blocking (TDD)

- [x] 2.1 Build Binary exact-value indexes on FusionRun inside `buildTrigramIndex`; compact identity ids; query in `getCandidates` (scenario: Binary unique value yields only exact identities).
- [x] 2.2 Build LIG3 length buckets using the same length-ratio bound as the LIG3 scorer; exclude out-of-bound identities (scenario: Identity outside LIG3 length bound is not a candidate).
- [x] 2.3 Stop using padded-trigram intersection as a candidate filter for Jaro-Winkler, Dice, double-metaphone, name-matcher, and custom Velocity (scenario: Trigram index is not the universal candidate filter; Jaro-Winkler near-miss with no shared trigram remains reachable).
- [x] 2.4 Intersect only recall-safe per-rule sets; mixed Binary + JW uses Binary hits only (scenario: Mixed Binary and Jaro-Winkler mandatory rules use Binary only to filter).
- [x] 2.5 Keep mandatory-missing empty Set + `mandatoryMissingBlockCount`; unbuilt index still `undefined` without incrementing mandatory-missing (existing scenarios).
- [x] 2.6 Keep `buildTrigramIndex` as the only init scoring-prep entry; store new indexes on FusionRun not MatchingService (scenario: buildTrigramIndex builds algorithm-aware blocking indexes).

## 3. Top-K identity matches (TDD)

- [x] 3.1 Remove identity-phase first-K loop break and exact-match mid-loop break in `scoreFusionAccount`.
- [x] 3.2 After scoring the whole pool, retain at most K identity-origin matches using `compareMatchesForForm` order (scenario: Stronger identity after three weaker passers is retained).
- [x] 3.3 Leave deferred scoring uncapped (scenario: Deferred scoring remains uncapped).
- [x] 3.4 Auto-merge rank-1 exact identity after form sort when multiple exact matches exist (`matchOutcomeDispatcher` + MatchingService tests) (scenarios: Identity scoring does not stop at the first exact match; Two exact matches auto-merge the rank-1 identity).
- [x] 3.5 Dispatcher still passes `getCandidates` Set vs full baseline on `undefined`; `maxIdentityMatches` is retention cap not first-K stop (scenarios: Identity candidate pool uses getCandidates result including empty set; Identity scoring cap is top-K retention).

## 4. Exhaustive-scoring oracle (TDD)

- [x] 4.1 Add a test-only oracle helper (not on MatchingService production API) that scores every fixture identity with blocking and K disabled (scenario: Oracle is not a production API).
- [x] 4.2 Fixture: JW pair with no shared padded trigram that still meets mandatory threshold; first-K trap; Binary unique → one comparison; assert production top-K ids and combined scores equal the oracle (scenario: Oracle and production top-K match on a planted fixture).
- [x] 4.3 Do not add any production or CI path that exhaustive-scores a 100k baseline.

## 5. Process epilogue

- [x] 5.1 Update `accountListPhases.ts` epilogue: full-scan message says candidate blocking unavailable (not “trigram blocking was ineffective”); log `identityComparisonCount` and `identityCandidateSetSizeSum` when non-zero (scenarios: Full-scan fallback summary; Identity comparison summary).
- [x] 5.2 Extend `accountListPhaseInstrumentation.test.ts` for the new counters and wording.

## 6. Verification

- [x] 6.1 Confirm canonical test command: `npx vitest run src/services/matchingService/__tests__/matchService.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts src/services/matchingService/__tests__/trigramIndex.test.ts src/model/__tests__/fusionRun.test.ts src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts` (plus any new oracle test file).
- [x] 6.2 All delta spec scenarios covered by named automated tests.
- [x] 6.3 Run `npm run test:scenario`.
- [x] 6.4 Run `npm run lint` and `npx tsc --noEmit`.

## 7. Documentation

- [x] 7.1 Update `docs/reference/observability.md`: algorithm-aware blocking vs trigram; new counters; `fullScanFallbackCount` on `undefined`.
- [x] 7.2 Update `docs/reference/match-flow.md` trigram paragraph to candidate blocking / top-K.
- [x] 7.3 Update JSDoc on `buildTrigramIndex`, `getCandidates`, and `scoreFusionAccount` for blocking indexes and top-K retention.

## 8. Changelog

- [x] 8.1 Create changelog entry via changelog-generator during apply.
- [x] 8.2 Confirm entry covers: recall-safe blocking (JW-only may full-scan), top-K vs first-K review/auto-merge change, new observability counters.
