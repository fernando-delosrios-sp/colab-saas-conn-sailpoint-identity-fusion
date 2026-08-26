# Design: status-heartbeat-cpu

## Context

`OperationHeartbeat` emits a `STATUS` line every `statsLoggingIntervalMs` (default 10s). `ServiceRegistry.getHeartbeatSnapshot()` already attaches `process.memoryUsage()`. `formatStatusLine` renders `mem={rssMB}MB({heapUsed/rss}%)` immediately before `elapsed=`.

CPU cannot be a snapshot. Node `process.cpuUsage([previousValue])` returns `{ user, system }` in microseconds; passing the previous result yields a diff. Percent of one core is `(user + system) / wall_microseconds * 100`. Combined time can exceed wall time when the libuv thread pool (or workers) uses more than one core.

The ISC host receives plain text only. STATUS must stay grep-friendly `name=value` segments.

## Goals / Non-Goals

**Goals:**
- Emit `cpu={integer}%` on STATUS next to `mem=` when a previous CPU sample exists.
- Measure against actual wall time between samples, seeded at heartbeat `start()`.
- Document how operators read `cpu=` with progress Δ and `api=` (and when STATUS silence means `WARN EVENT_LOOP` instead).
- Extend glossary / ubiquitous-language STATUS vocabulary.

**Non-Goals:**
- User/system split or CPU-seconds on the line.
- `os.loadavg()`, cgroup quota, or host-wide CPU.
- CPU on email reports, `EVENT_SUMMARY`, or `METRIC`.
- Stall detection keyed on CPU.
- Changing heartbeat interval or `mem=` format.

## Decisions

### D1: Token `cpu=87%` after `mem=`, before `elapsed=`
- **Choice**: Integer percent, no decimals, no user/sys, no CPU-seconds. Example: `mem=1992.07MB(96%) cpu=87% elapsed=22M 14S`.
- **Reason**: Same density as other STATUS segments; the 4-tuple (phase/progress Δ, `api=`, `cpu=`, `mem=`) is enough to classify working vs waiting.
- **Considered alternatives**: `cpu=8.70s(87%)` (mem rhyme, extra parse); `cpu=87%(82u/5s)` (diagnostic, unused for Fusion’s JS-bound pain); omit until operators ask — rejected, the request is the token plus reading docs.

### D2: Snapshot carries current usage; heartbeat holds the baseline
- **Choice**: Add `cpu?: { user: number; system: number }` (or `NodeJS.CpuUsage`) on `HeartbeatSnapshot` from `process.cpuUsage()` in `getHeartbeatSnapshot()`. `OperationHeartbeat` keeps `previousCpu` and `previousCpuAt` (epoch ms). `formatStatusLine` receives previous usage + previous timestamp (or a precomputed percent) via `StatusLineBaselines` and emits `cpu=` only when previous exists and wall > 0.
- **Reason**: Mirrors `memory` (stateless snapshot) plus progress/api deltas (stateful baselines on the heartbeat). `formatStatusLine` stays a pure function.
- **Considered alternatives**: Call `process.cpuUsage(previous)` inside the registry (hides state in the wrong layer); compute only in `tick()` and pass a number (harder to unit-test the formula with injected snapshot fields).

### D3: Seed at `start()`; do not reset on phase change
- **Choice**: On `start()`, record `process.cpuUsage()` and `Date.now()` so the first STATUS can include `cpu=`. On `stop()`, clear like other baselines. Phase/step/progress-unit changes MUST NOT clear the CPU baseline.
- **Reason**: First tick without seed would omit `cpu=` exactly when operators look for “did we start working?” Phase boundaries are when intensity often changes.
- **Considered alternatives**: Omit until tick 2 (consistent with progress Δ, but CPU has a natural seed at start); reset on phase change (creates a blind tick at Refresh→Process).

### D4: Wall-clock denominator, allow >100%
- **Choice**: `pct = round((delta.user + delta.system) / ((now - previousCpuAt) * 1000) * 100)` with `process.cpuUsage(previousCpu)` or manual subtract. Use actual elapsed, not `snapshot.intervalMs`. Do not clamp at 100. If `now === previousCpuAt`, omit `cpu=`.
- **Reason**: A late tick after a 25s block would report ~250% if divided by a 10s interval. Node documents that usage can exceed elapsed time when multiple cores are used.
- **Considered alternatives**: Configured interval as denominator (wrong after EVENT_LOOP gaps); cap at 100 (hides thread-pool); `os.availableParallelism()` normalization (operators think in “one Node process / one core”).

### D5: Docs teach the 4-tuple, not the formula
- **Choice**: `docs/use-guides/operation/monitor-aggregation-progress.md` adds a section under “read aggregation health” with a table: high cpu + progress moving + api idle → local work; low cpu + api moving → ISC-bound; high cpu + progress flat → spin; no STATUS → event-loop / platform reset. Refresh example line includes `cpu=87%`. `docs/reference/observability.md` STATUS row and example mention `cpu=`. Glossary STATUS line + **STATUS CPU segment**. Do not document alerting on `cpu>80%` alone.
- **Reason**: Healthy Refresh should look CPU-hot. Without the table, operators will file API-tuning tickets or false alerts.
- **Considered alternatives**: Token-only mention in observability (user asked for log-reading sections).

### D6: Tests inject usage, do not spin the CPU
- **Choice**: Unit-test `formatStatusLine` with snapshot `cpu` plus baselines `{ previousCpu, previousCpuAt }` (or equivalent) under fake timers so percent is deterministic. Optionally test `tick()` with a mocked snapshot getter. Do not assert live `process.cpuUsage()` in CI.
- **Reason**: Microsecond diffs are not stable; the contract is the token spelling and the wall-time formula.
- **Considered alternatives**: Integration test that busy-loops 200ms — flaky and slow.

## Risks / Trade-offs

- [Risk] Operators alert on high `cpu=` during Refresh → Mitigation: monitor-guide table; CHANGELOG notes STATUS additive field and “do not alert on CPU alone.”
- [Risk] `cpu=` missing while the loop is blocked → Mitigation: existing `WARN EVENT_LOOP`; docs state STATUS (and `cpu=`) cannot speak during a block.
- [Risk] Log parsers that split STATUS on a fixed number of tokens → Mitigation: additive `name=value`; CHANGELOG; grep `cpu=` not column index.
- [Trade-off] Integer percent hides sub-1% idle Fetch ticks (rounds to 0) → Accept: triage is high vs low, not 0.4 vs 0.7.
- [Trade-off] One-core percent is not container quota → Accept: same honesty as `mem=` not being a cgroup limit.

## Migration Plan

N/A — no deployment or stored-data changes. Rollback = revert. Operators who scrape STATUS should allow an optional `cpu=` segment after `mem=`.

## Open Questions

None. Discovery forks are closed.
