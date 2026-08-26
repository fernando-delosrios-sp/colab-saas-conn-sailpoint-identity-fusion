## Scope

In: canonical names for analysis vs aggregation vs review communications; make the `report` action produce the same Match preview as dry-run (no ISC persistence). Out: recording/replay JSON artifacts, `ScoreReport` internals, changing who receives which email.

## Language

**Dry-run report** (`promote`):
The HTML/email Match preview produced by account-list in dry-run mode, without persisting Fusion outcomes.
_Avoid_: Fusion report, aggregation report, custom:dryrun report

**Fusion report** (`conflicts-with-canonical`):
The same Match preview as the dry-run report, triggered from ISC by assigning the `report` action. Canonical today only names the action entitlement, not the artifact.
_Avoid_: aggregation report, on-demand analysis report, “Fusion report” for aggregation-on-owner email

**Aggregation report** (`promote`):
The post-run HTML/email after a persistent account-list, gated by **Send report to owner on aggregation?**.
_Avoid_: Fusion report, Identity Fusion Report (as the only title for every HTML family)

**Fusion Review decision section** (`promote`):
The HTML section listing applied FusionDecision rows (and automatic merges) inside a report document.
_Avoid_: Fusion report, post-manual-match report, review report

**Fusion review** (`conflicts-with-canonical`):
The reviewer-facing “review required” communication (email + review form). Not a report.
_Avoid_: Fusion report, review report, Fusion review email-as-report

## Decisions

Context: “Fusion report” was used for the entitlement, the ad-hoc HTML, the aggregation email, and loosely for review traffic.

1. Locked names — dry-run report / Fusion report / aggregation report / Fusion Review decision section / Fusion review.
2. Unify — Fusion report is the same Match preview as dry-run, invoked from ISC (not today’s lighter score-and-email short-circuit).
3. Fusion review stays a review notification, never a report product.
4. Recording files (`aggregation.json`, `matching-results.json`, `replay-report.json`) stay out of this vocabulary.

## Open questions

None blocking. Wiring (how the `report` action enters dry-run Match mode without streaming account-list) is a design concern.

## Scenarios discussed

- Operator dry-run with `saveFile`/`sendEmail` vs ISC user requesting `report`.
- Same Match cards (auto / manual / deferred / non-match) on both analysis paths; no forms, merges, or correlation persisted.
- Aggregation report still includes the Fusion Review decision section for this run.
- Reviewer receives Fusion review (“review required”), not a report.
- Docs and entitlement copy stop calling the aggregation email “Fusion report.”
