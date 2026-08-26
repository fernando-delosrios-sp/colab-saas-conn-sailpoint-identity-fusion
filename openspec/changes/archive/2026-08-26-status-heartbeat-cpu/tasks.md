## 1. Heartbeat snapshot and formatter (TDD)

- [x] 1.1 Extend `HeartbeatSnapshot` with optional `cpu: NodeJS.CpuUsage` and `StatusLineBaselines` with `previousCpu` plus `previousCpuAt` (epoch ms). Keep `formatStatusLine` pure.
- [x] 1.2 In `formatStatusLine`, when previous CPU and positive wall elapsed exist, emit `cpu={rounded integer}%` after `mem=` and before `elapsed=`. Formula: `(delta.user + delta.system) / ((now - previousCpuAt) * 1000) * 100`. Omit `cpu=` when previous is missing or wall is zero. Do not clamp at 100. Do not use `intervalMs` as the denominator.
- [x] 1.3 Add tests in `src/services/logService/__tests__/operationHeartbeat.test.ts` with injected `cpu` and fake timers: (a) `cpu=87%` after `mem=` before `elapsed=`; (b) omit `cpu=` without previous; (c) 25s wall and 25s of one-core usage → `cpu=100%` not `250%` when interval is 10s; (d) 150% of one core → `cpu=150%`; (e) existing memory/progress assertions still pass.

**Verify:** `npx vitest run src/services/logService/__tests__/operationHeartbeat.test.ts` exit 0.

## 2. Snapshot source and heartbeat lifecycle

- [x] 2.1 In `ServiceRegistry.getHeartbeatSnapshot()`, set `cpu: process.cpuUsage()` next to `memory`.
- [x] 2.2 In `OperationHeartbeat.start()`, seed `previousCpu` and `previousCpuAt`. In `tick()`, pass those baselines into `formatStatusLine`, then store the snapshot’s `cpu` and current time. In `stop()`, clear CPU baselines with the other counters. Do **not** clear CPU baselines in `resetProgressBaselineIfContextChanged`.
- [x] 2.3 Test `start`/`tick`/`stop` with a mocked `getSnapshot` (or equivalent): first tick includes `cpu=` after seed; a phase change between ticks still includes `cpu=`; `stop` then format without previous omits `cpu=`. Do not busy-loop `process.cpuUsage()` in CI.

**Verify:** `npx vitest run src/services/logService/__tests__/operationHeartbeat.test.ts` exit 0.

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npx vitest run src/services/logService/__tests__/operationHeartbeat.test.ts` (full suite `npm test` before PR).
- [x] 3.2 All delta spec scenarios covered by named automated tests (`cpu` after `mem`, first tick after seed, omit without previous, wall time not interval, percent may exceed 100, phase change does not drop `cpu=`).
- [x] 3.3 `npm run lint`

## 4. Documentation

- [x] 4.1 In `docs/use-guides/operation/monitor-aggregation-progress.md`, add a **log-reading** section under “read aggregation health”: table of `cpu=` × progress Δ × `api=` (local work vs ISC-bound vs spin vs no STATUS / `WARN EVENT_LOOP`). State do not alert on high CPU alone. Update the Refresh example to `mem=1992.07MB(96%) cpu=87% elapsed=22M 14S`. Mention `cpu=` in the STATUS row of “What to watch.”
- [x] 4.2 In `docs/reference/observability.md`, document `cpu={percent}%` on the STATUS row (one-core, sample window, may exceed 100). Update STATUS examples that show `mem=` or the trailing resource segment. In “Silent runs and platform resets,” note that `cpu=` cannot emit while the loop is blocked.
- [x] 4.3 In `docs/glossary.md`, extend **STATUS line** to include CPU; add **STATUS CPU segment** (`cpu={percent}%`, not load average or quota).
- [x] 4.4 Skip README / getting-started — no install, config, or first-run behavior change.
- [x] 4.5 JSDoc on `HeartbeatSnapshot.cpu` (process `cpuUsage` snapshot for STATUS, not host load).

## 5. Changelog

- [x] 5.1 During apply, invoke **changelog-generator** and merge into today’s `CHANGELOG.md` section (no Unreleased heading).
- [x] 5.2 Confirm the entry covers additive STATUS `cpu=` and tells operators not to alert on high CPU alone; note optional `cpu=` after `mem=` for scrapers.
