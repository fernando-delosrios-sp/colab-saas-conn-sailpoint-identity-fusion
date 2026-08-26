## Scope

In: account-list `STATUS` lines SHALL include a compact process CPU percent token (`cpu=87%`) next to `mem=`, computed over the actual sample window, plus operator docs that teach how to read `cpu=` with progress Δ and `api=`. Out: user/sys split, CPU-seconds, load average, cgroup quota, email `usedMemory`, `EVENT_SUMMARY`/`METRIC` CPU, stall detection keyed on CPU.

## Language

**STATUS CPU segment** (`promote`):
The `cpu={percent}%` token on a **STATUS line**. Integer percent of one core for the connector process over the sample window (`process.cpuUsage` user+system vs wall time).
_Avoid_: load average, host CPU, container quota, `cpu-seconds`

**Sample window** (`draft`):
The wall-clock interval from heartbeat start (or the previous STATUS sample) to the current tick. CPU percent uses this elapsed time, not the configured heartbeat interval.
_Avoid_: treating `statsLoggingIntervalMs` as the CPU denominator when the tick is late

Conflicts-with-canonical: **STATUS line** currently lists memory and elapsed but not CPU. This change extends that definition; it does not rename STATUS.

## Decisions

Context: `STATUS` already shows phase, progress Δ, `api=`, `mem=RSS(heap%)`, elapsed. Operators infer “working vs waiting” from progress vs queue. Memory is a point-in-time snapshot; CPU is a rate. Node `process.cpuUsage([previous])` returns user+system microseconds; percent of one core can exceed 100% if the thread pool is busy.

Q1: Token shape?
Chosen: **`cpu=87%`** (integer, one core). Not `cpu=8.70s(87%)` and not user/sys split. Same density as other STATUS segments.

Q2: Denominator?
Chosen: **actual wall time** between samples (seeded at `OperationHeartbeat.start()`). Do not divide by configured `intervalMs` after a blocked/late tick.

Q3: First tick?
Chosen: **seed `process.cpuUsage()` at heartbeat start** so the first STATUS can include `cpu=`. Omit `cpu=` only if no previous sample exists.

Q4: Phase change?
Chosen: **do not reset the CPU baseline** on phase/step change. A blind tick at Refresh→Process would hide the moment operators most want the number.

Q5: Values over 100%?
Chosen: **allow**. Cap-at-100 would hide libuv thread-pool time.

Q6: Docs?
Chosen: **operator-facing how-to**, not just a field mention. `monitor-aggregation-progress.md` gets a read-the-line section (cpu × progress Δ × `api=`). `observability.md` documents the token. Glossary / ubiquitous-language STATUS line includes CPU.

Q7: Other surfaces?
Chosen: **STATUS only**. No email report, no `EVENT_SUMMARY`, no `METRIC`, no `WARN STALL` on CPU.

## Open questions

None blocking.

## Scenarios discussed

- Refresh: high `cpu=`, idle `api=`, progress moving → local work; do not tune HTTP concurrency.
- Fetch: low `cpu=`, `api=` moving, population counters advancing → ISC-bound.
- High `cpu=`, progress flat → spin / code path, not API stall.
- Heartbeats stop → `WARN EVENT_LOOP` still owns the story; `cpu=` cannot emit while the loop is blocked.
- Late tick after 25s block: percent uses 25s wall, not 10s configured interval.
- First STATUS after `start()` includes `cpu=` because start seeded the previous usage.
- Thread pool busy: `cpu=` MAY exceed 100.
- `mem=` still RSS and heap ratio; CPU does not replace memory.
