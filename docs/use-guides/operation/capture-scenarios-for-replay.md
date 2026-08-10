# Capture scenarios for replay

Use this guide when you need to **record real ISC API traffic and replay aggregations offline** — for regression testing, CI pipelines, or interactive debugging without live tenant calls.

**Reference:** [Scenario recording](../../reference/scenario-recording.md) · **Regression checklist:** [Testing and validation](../validation-and-troubleshooting/testing-and-validation.md#required-assertions-regression-checklist) · **Prerequisite:** [Run the connector via proxy](run-via-proxy.md)

!!! note "Didactic guide"
    This page covers the capture-and-replay workflow. For artifact schemas, CLI flags, and harness tests, see [Scenario recording](../../reference/scenario-recording.md).

---

## When you need this

| Goal | What to do |
| --- | --- |
| Regression test after connector or config changes | Record once; replay with `npm run test-recording` |
| Debug match outcomes with score breakdowns | Record in record mode; inspect `reports/matching-results.json` |
| CI gate before merge | Headless `test-recording` in pipeline |
| Interactive investigation | `npm run replay` with live connector output |

Recording requires a **proxy server** with filesystem access — ISC platform processing cannot write recording artifacts.

---

## Prerequisites

1. Proxy server running with `PROXY_PASSWORD` set — see [Run the connector via proxy](run-via-proxy.md)
2. ISC source configured for proxy mode (external processing + proxy mode on)
3. Representative tenant state for the scenario you want to capture

---

## Workflow: capture a scenario

### 1. Enable recording in ISC

Advanced Settings → **External Settings**:

1. **Enable external processing?** — on
2. **Enable proxy mode?** — on
3. **Enable chain recording?** — on
4. **Recording chain name** — scenario segment only (for example `baseline-hr-ad`, not the tenant prefix)

### 2. Run representative operations

Run a representative **account aggregation** (and any follow-up operations you want in the chain). Artifacts accumulate on the proxy server host under `recordings/<tenant>/{recordingName}/`, where `<tenant>` is derived from connection **Base URL**.

| Artifact | Purpose |
| --- | --- |
| `api-log.ndjson` | ISC API pairs — replay adapter serves these instead of live calls |
| `steps.ndjson` | Per-operation inputs, outputs, and state snapshots |
| `scenario.json` | Compiled replay scenario (written on clean exit) |
| `reports/matching-results.json` | Match score breakdowns (record-mode account-list) |

### 3. Finalize if needed

If the connector exits uncleanly without writing `scenario.json`:

```bash
npm run finalize -- "company1296-poc/baseline-hr-ad"
```

Quote refs that contain `/`.

---

## Workflow: replay and verify

On the machine that holds the recordings directory:

```bash
npm run build

# Interactive replay with golden comparison
npm run replay -- "company1296-poc/baseline-hr-ad"

# Headless CI regression
npm run test-recording -- "company1296-poc/baseline-hr-ad"
```

| Command | Use when |
| --- | --- |
| `npm run replay` | Interactive debugging with live connector output |
| `npm run test-recording` | Fast headless regression before commit or in CI |
| `npm run finalize -- "tenant/scenario"` | Recover `scenario.json` after unclean exit |

Replay serves all ISC calls from `api-log.ndjson` — no live tenant API traffic during verification.

---

## Workflow: validate after config changes

Use the [regression checklist](../validation-and-troubleshooting/testing-and-validation.md#required-assertions-regression-checklist) in **Testing and validation** after configuration changes. For harness unit tests and the `matching-results.json` schema, see the same guide.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No recording artifacts | Proxy mode and chain recording enabled; aggregation ran on proxy server host; `recordingName` set |
| Empty replay | `api-log.ndjson` exists and is non-empty; scenario ref quoted correctly |
| `scenario.json` missing | Run `npm run finalize`; re-record if artifacts incomplete |
| Dry-run + recording conflict | Use one mode at a time — see [Analyze changes with dry-run](analyze-with-dry-run.md) |

---

## Related guides

| Topic | Resource |
| --- | --- |
| Artifact schema and CLI reference | [Scenario recording](../../reference/scenario-recording.md) |
| Proxy server setup | [Run the connector via proxy](run-via-proxy.md) |
| Dry-run before production changes | [Analyze changes with dry-run](analyze-with-dry-run.md) |

