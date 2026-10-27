## Scope

Provide an opt-in Advanced Option toggle (`fusionDropAccountsAfterEmit`) that emits ISC accounts immediately as they are assembled during identity processing and drops full FusionAccount instances from memory before the Match sweep, retaining only lightweight candidate records and rebuilding auto-matched accounts on-demand via the ISC API.

## Language

**Match Candidate Record** (`promote`):
A compact, immutable projection of an identity containing only its identifier, display name, and the union of attributes required for match scoring, review form generation, and aggregation reporting (`matchingRules ∪ fusionFormAttributes ∪ reportAttributes`).
_Avoid_: raw candidate, unpruned candidate, candidate fusion account.

**Early Account Emission** (`promote`):
An aggregation execution mode where accounts ready for ISC output are streamed to the connector response during identity assembly rather than held in-memory until Phase 5, relying on ISC last-write-wins semantics for any subsequently updated accounts.
_Avoid_: speculative streaming, partial output.

## Decisions

- **Context**: Large-tenant aggregations (100k+ identities) face high memory pressure when keeping all full `FusionAccount` instances in memory through the entire uncorrelated match sweep.
- **Q1**: Should `FusionAccount` instances be kept in memory or emitted early and dropped?
  - *Chosen*: Introduce an opt-in toggle (`fusionDropAccountsAfterEmit`, default `false`). Default keeps current behavior; toggle enables early emit and drop.
- **Q2**: What should be retained for matching and review forms when `FusionAccount`s are dropped?
  - *Chosen*: Create a decoupled `MatchCandidateRecord` containing `identityId`, `identityName`, and the projected attribute bag needed by Matching, FormService, and ReportBuilder. Zero network calls for forms or reports.
- **Q3**: How should auto-matched accounts be handled when their `FusionAccount` has already been emitted and dropped?
  - *Chosen*: Re-fetch the target identity on-demand via the ISC API (`fetchIdentityById`), rebuild the `FusionAccount` with the new managed account layer, re-evaluate defined attributes, and re-emit the updated `ISCAccount` to the response stream (leveraging ISC last-write-wins).

## Open questions

None. All key architectural decisions and failure modes have been resolved.

## Scenarios discussed

- Default run with toggle `false`: Behavior, memory lifecycle, and Phase 5 single-pass emission remain 100% identical to current code.
- Toggle `true` with no auto-matches: Accounts are streamed in Phase 3/4, memory drops immediately, match sweep runs against compact `MatchCandidateRecord`s, and Phase 5 has zero accounts left to send.
- Toggle `true` with auto-match: Match engine scores against `MatchCandidateRecord`, triggers exact match, re-fetches identity via ISC API, re-assembles the `FusionAccount`, re-evaluates definitions, and sends the updated `ISCAccount` to `res.send()`.
- Toggle `true` with partial match / review forms: `FormService` generates review forms using the candidate's projected attributes from `MatchCandidateRecord` without making extra API calls.
- Toggle `true` with dry-run mode: Accounts are streamed to the output stream without persisting state, identical to persistent runs.
