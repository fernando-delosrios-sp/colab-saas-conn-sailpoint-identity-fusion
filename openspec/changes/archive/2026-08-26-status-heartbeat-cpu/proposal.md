# Proposal: status-heartbeat-cpu

## Why

STATUS already shows progress Δ, `api=`, and `mem=`, but operators still infer whether a tick was compute-bound or waiting on ISC. Memory is a snapshot; it does not say the process was busy. Adding `cpu=` on the same line makes working-vs-waiting a lookup, and docs must teach that 4-tuple so the token is not misread as host load or a stall signal.

## What Changes

**STATUS CPU segment**
- From: `STATUS … mem=1992.07MB(96%) elapsed=22M 14S` with no process CPU.
- To: `STATUS … mem=1992.07MB(96%) cpu=87% elapsed=22M 14S` — integer percent of one core over the actual sample window (`process.cpuUsage` user+system vs wall time). Seed usage at heartbeat start; omit `cpu=` only when no previous sample exists; do not reset on phase change; values MAY exceed 100.
- Reason: operators need a busy-vs-waiting label next to progress Δ and `api=`.
- Impact: additive STATUS token; non-breaking for pipeline behavior. Log scrapers that parse the whole line as a fixed field list need to allow `cpu=`.

**Operator log-reading docs**
- From: STATUS described as phase, progress, `api=`, memory, elapsed; Refresh example has `mem=` only; no how-to for combining CPU with queue and progress.
- To: `monitor-aggregation-progress.md` includes a section on reading `cpu=` with progress Δ and `api=` (local work vs ISC-bound vs spin vs silent loop). `observability.md` documents the token next to memory. Glossary and ubiquitous-language STATUS line include CPU.
- Reason: a bare `cpu=87%` will be misread (alert on high CPU during healthy Refresh) without the 4-tuple playbook.
- Impact: docs-only for operators; no connector-spec UI change.

**Surfaces left unchanged**
- From/To: no CPU on email reports, `EVENT_SUMMARY`, `METRIC`, or `WARN STALL`. Stall stays api-queue completed delta. Event-loop blocks stay `WARN EVENT_LOOP`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `log-service`: STATUS SHALL include `cpu={percent}%` when a previous CPU sample exists; percent is one-core relative over actual wall time.
- `ubiquitous-language`: **STATUS line** includes CPU; add **STATUS CPU segment**.

## Impact

- **Code**: `src/services/logService/operationHeartbeat.ts`, `src/services/serviceRegistry.ts` (`getHeartbeatSnapshot`), `src/services/logService/__tests__/operationHeartbeat.test.ts`.
- **Specs**: deltas for `log-service` and `ubiquitous-language`.
- **Docs**: `docs/use-guides/operation/monitor-aggregation-progress.md` (how-to read CPU with progress and `api=`), `docs/reference/observability.md` (token + example), `docs/glossary.md` (STATUS line + STATUS CPU segment), CHANGELOG.
- **APIs/contracts**: no connector-spec schema changes. Additive log token only.
