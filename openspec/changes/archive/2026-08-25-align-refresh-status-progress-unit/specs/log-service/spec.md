## ADDED Requirements

### Requirement: Refresh STATUS SHALL render refreshed progress the same way as fetched

When `log.setProgress` is invoked with unit `refreshed` during Refresh phase, the operation heartbeat SHALL include that progress on the STATUS line in the same shape as Fetch `fetched`: `progress={done}/{total} refreshed` with an optional delta suffix after the first tick (or after a unit change). Refresh STATUS SHALL NOT append a separate cumulative `refreshed(N)` segment. The heartbeat SHALL NOT emit a distinct `REFRESH` line kind. The log service SHALL NOT expose `recordRefreshedAccount` or a `refreshedCount` field for STATUS.

#### Scenario: Refreshed unit appears on STATUS like Fetch fetched

- **GIVEN** Refresh phase has called `setProgress(19032, 102407, 'refreshed')`
- **WHEN** the operation heartbeat interval fires
- **THEN** the connector host SHALL receive an INFO STATUS line
- **AND** the line SHALL include `progress=19032/102407 refreshed`
- **AND** the line SHALL NOT contain `processed(`
- **AND** the line SHALL NOT contain `refreshed(` as a standalone cumulative segment

#### Scenario: Refreshed progress delta uses previous tick baseline

- **GIVEN** progress was 19032/102407 refreshed at the previous STATUS tick
- **AND** a caller invokes `setProgress(19224, 102407, 'refreshed')` before the next tick
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a pipeline progress delta of `+192` over the heartbeat interval attached to unit `refreshed`

#### Scenario: Unit change from fetched to refreshed resets delta baseline

- **GIVEN** the previous STATUS tick showed unit `fetched`
- **WHEN** the next tick shows unit `refreshed`
- **THEN** the refreshed progress delta suffix MAY be omitted on that first refreshed tick
- **AND** subsequent refreshed ticks SHALL include deltas against the refreshed baseline

---

## MODIFIED Requirements

### Requirement: Reviewer decision outcomes are logged and summarized

The log service SHALL emit INFO headline lines for fusion review decisions using standardized prefixes: `NEW IDENTITY DECISION`, `MERGE DECISION`, `NO-MATCH DECISION`, and `AUTO-MERGE DECISION`. Each headline SHALL suffix `DISCOVERED` when a finished form is parsed during Fetch and `APPLIED` when the decision takes effect (Refresh for merge, Process for new identity/no-match, or Process for automatic merge). Headlines SHALL include account label `[sourceName]`, merge target or reviewer name when available, and an outcome suffix on applied lines (for example `→ registered as fusion account`).

Decision metrics SHALL be recorded via `recordEvent('decision', { type })` with types `newIdentity`, `merge`, `noMatch`, and `autoMerge`. Cumulative decision counters SHALL appear in compact form `decisions(Nn/Mm/NMnm/Aa)` on STATUS lines during Process phase (when non-zero or during `process-decisions`), on phase-complete DETAIL lines, and in EVENT_SUMMARY as `decisions new-identity=… merge=… no-match=… auto-merge=…` with interval deltas.

#### Scenario: Decision segment on process phase complete

- **GIVEN** an account-list run applied 1 new-identity and 1 merge decision
- **WHEN** Process phase completes
- **THEN** the phase-complete DETAIL line SHALL include `decisions=decisions(1n/1m/0nm/0a total=2)`

#### Scenario: Refresh STATUS includes correlation segment

- **GIVEN** an account-list operation in Refresh phase with cumulative link correlation activity
- **AND** pipeline progress uses unit `refreshed`
- **WHEN** the next STATUS heartbeat fires
- **THEN** the STATUS line SHALL include a correlation segment with link totals alongside `progress=` with unit `refreshed`
- **AND** the line SHALL NOT require a standalone `refreshed(N)` segment
