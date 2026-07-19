## 1. Update master ubiquitous-language spec

- [x] 1.1 Rewrite `openspec/specs/ubiquitous-language/spec.md` with the comprehensive term definitions, account taxonomy, phase/sweep vocabulary, matching/scoring distinction, candidate types, and enforcement rules.
- [x] 1.2 Ensure every requirement has at least one scenario and uses SHALL/MUST.
- [x] 1.3 Remove or migrate retired terms (`identity-based`, `new-unmatched`, `pass`, `phase` for matching, `processing run`).

## 2. Update user-facing glossary

- [x] 2.1 Rewrite `docs/concepts/glossary.md` as a curated, user-friendly mirror of the master spec.
- [x] 2.2 Ensure all canonical terms from the spec appear in the glossary with consistent definitions.
- [x] 2.3 Run `npm run lint:markdown` and fix any issues.

## 3. Add AI agent instruction

- [x] 3.1 Add a section to `.agents/AGENTS.md` instructing AI agents to consult `openspec/specs/ubiquitous-language/spec.md` and use canonical terms when generating code or documentation.
- [x] 3.2 Include the rule that new domain terms must be added to the spec before being used in code or docs.

## 4. Align code symbols in fusion service

- [x] 4.1 Rename `ManagedAccountPassRunner` to `ManagedAccountMatchingRunner` and update all imports/usages.
- [x] 4.2 Rename `ManagedAccountPassRunnerState` to `ManagedAccountMatchingRunnerState`.
- [x] 4.3 Rename `ManagedAccountPassResult` and `ManagedAccountPassResolution` if needed, or confirm they remain valid.
- [x] 4.4 Rename `analyzeIdentityPhase` to `scoreIdentityCandidates` and `analyzeDeferredPhase` to `scoreDeferredCandidates` in `ManagedAccountAnalyzer`.
- [x] 4.5 Rename `hasNewUnmatchedPeerMatches` to `hasDeferredMatches` in `helpers.ts` and update all call sites.
- [x] 4.6 Rename `MatchCandidateType.NewUnmatched` to `MatchCandidateType.Deferred` and update all references.
- [x] 4.7 Change `candidateType: 'new-unmatched'` to `'deferred'` in `FusionReportMatch`, `FusionMatch`, tests, and scoring service.
- [x] 4.8 Rename `runCorrelatedManagedAccountPrePass` to `runCorrelatedAccountSweep` or equivalent.
- [x] 4.9 Update internal comments and log messages to use "sweep" and "deferred candidate" terminology.

## 5. Align dry-run payload

- [x] 5.1 Remove the `wireCandidateType` translation that maps `'new-unmatched'` to `'deferred'` in `src/operations/helpers/buildDryRunPayload.ts`.
- [x] 5.2 Update dry-run tests and payloads to expect `'deferred'` directly.

## 6. Update tests

- [x] 6.1 Update `managedAccountPassRunner.test.ts` to reference `ManagedAccountMatchingRunner` and `deferred` candidate type.
- [x] 6.2 Update `fusionService.test.ts` references to `new-unmatched`, phase names, and runner class.
- [x] 6.3 Update `managedAccountAnalysisRecorder.test.ts` references.
- [x] 6.4 Update `scoringService.test.ts` references to `MatchCandidateType.Deferred`.
- [x] 6.5 Update `formService` tests that mention `new-unmatched`.
- [x] 6.6 Run `npm test` and fix failures.

## 7. Verify and lint

- [x] 7.1 Run `npm run typecheck` and fix any type errors.
- [x] 7.2 Run `npm run lint` and fix any issues.
- [x] 7.3 Run `npm run lint:markdown` and fix any issues.
- [x] 7.4 Run `npm test` and ensure all tests pass.

## 8. Final review

- [x] 8.1 Read the updated spec and glossary to ensure consistency.
- [x] 8.2 Search the codebase for retired terms (`new-unmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `ManagedAccountPassRunner`, `hasNewUnmatchedPeerMatches`, `identity-based`, `processing run`) and confirm none remain except in legitimate historical contexts.
- [x] 8.3 Verify `.agents/AGENTS.md` contains the new instruction.
