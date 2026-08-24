# Monitor aggregation progress

Use this guide when you need to **know whether an aggregation is healthy** and **where it is in the pipeline** — during production runs, troubleshooting, or capacity planning.

**Configuration reference:** [Advanced Settings — External Settings](../../configuration/advanced.md#external-settings) · **Log format reference:** [Observability and log format](../../reference/observability.md) · **Phase map:** [Config to account-list phases](../../reference/config-to-phases.md)

!!! note "Didactic guide"
    This page explains **how and when** to configure external logging and interpret key log lines. For full log segment formats, grep targets, and field definitions, see [Observability and log format](../../reference/observability.md).

---

## When you need this

| Situation | What to do |
| --- | --- |
| Production aggregation running for hours | Enable external logging; watch `STATUS` heartbeats and `PHASE` boundaries |
| Aggregation appears stuck | Check for `WARN STALL`; compare `api=` queue segment in consecutive `STATUS` lines |
| Match or correlation counts look wrong | Grep `EVENT_SUMMARY` for interval deltas |
| Proxy deployment | Enable disk logging on the proxy server; ISC client does not ship logs externally |
| Splunk, Datadog, or custom HTTP receiver | Enable direct-mode HTTP POST logging from ISC |

---

## Workflow: enable external logging

External logging routing depends on connector role:

| Role | Behavior |
| --- | --- |
| **Direct ISC processing** | HTTP POST plain-text lines to **External target URL** |
| **Proxy client (ISC)** | No external logging — proxy server owns logs |
| **Proxy server** | Append lines to `LOG_FILE` or `logs/<tenant>/fusion-{YYYYMMDD}.log` |

### Direct ISC processing (no proxy)

1. Advanced Settings → **External Settings**
2. **Enable external processing?** — on
3. **Enable proxy mode?** — off
4. **External target URL** — your log HTTP endpoint (for example `https://logs.example.com/fusion`)
5. **Enable external logging?** — on
6. **External logging level** — Info for production; Debug for troubleshooting

Each log entry is a plain-text line sent via HTTP POST with `Content-Type: text/plain`. Optional header `x-fusion-baseurl` carries the tenant base URL for multi-tenant receivers.

**Local receiver for development:**

```bash
mkdir -p logs
LOG_FILE=logs/remote-logs-$(date +%Y%m%d).log npm run log-server
# Listens on port 3000; set External target URL to http://your-host:3000/
```

Or use `npm run remote-log-server` to start the receiver plus a tunnel for ISC reachability.

### Proxy server (disk logging)

When the connector runs as the proxy server (`PROXY_PASSWORD` set on the host):

1. Enable **Enable external logging?** in External Settings (forwarded in config from ISC).
2. Logs append to:
    - `LOG_FILE` when set (exact path — no tenant subdirectory), or
    - `logs/<tenant>/fusion-{YYYYMMDD}.log` under the server working directory.

The proxy **client** in ISC does not ship logs externally — inspect logs on the server host or tail the daily file.

For proxy setup, see [Run the connector via proxy](run-via-proxy.md).

---

## Workflow: read aggregation health from logs

During long `accountList` aggregations, the connector emits standardized prefixes (prefixed with `[accountList]`). Config bootstrap messages use `[config]`.

### What to watch

| Prefix | Level | Use for |
| --- | --- | --- |
| `STATUS` | Info | Periodic heartbeat: phase, step, progress, `api=` queue segment, elapsed time |
| `EVENT_SUMMARY` | Info | Interval deltas for review/merge matches, decisions, correlations, emails (not emitted for non-matched-only ticks; use `STATUS`) |
| `PHASE` / `STEP` | Info | Pipeline boundary markers (`START` / `END elapsed=…`) |
| `DETAIL` | Info | Milestones as `key=value` pairs |
| `WARN STALL` | Warn | API queue idle for two consecutive heartbeat ticks |
| `EPILOGUE` | Info | Report epilogue start/end |

**Example line:**

```
14:30:45 [INFO]  [accountList] STATUS phase=4 step=process progress=1200/5400 api=42/3/891 elapsed=183s
```

### Quick grep targets

```bash
grep 'PHASE.*START' connector.log
grep 'PHASE.*END' connector.log
grep 'STATUS' connector.log
grep 'WARN STALL' connector.log
grep 'EVENT_SUMMARY' connector.log
```

Map phases 1–5 to configuration and pipeline steps using [Config to account-list phases](../../reference/config-to-phases.md).

For match segments (`matches(...)`), decision segments (`decisions(...)`), correlation counters, decision headline lines, and full grep examples, see [Observability and log format](../../reference/observability.md).

---

## Log levels

| Level | What gets logged | Use when |
| --- | --- | --- |
| **Error** | Critical errors only | Production; minimal volume |
| **Warn** | Errors + warnings | Production; catch issues |
| **Info** | Standard operational messages | Production monitoring (recommended) |
| **Debug** | All logs including debug details | Troubleshooting; high volume |

!!! note
    Debug level generates high log volume; use temporarily. ISC debug logging (`spConnDebugLoggingEnabled`) is separate and does not replace external delivery.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No external logs (direct mode) | External processing + logging enabled; proxy mode off; URL accepts POST |
| No external logs (proxy mode) | Server disk path (`LOG_FILE` or `logs/<tenant>/`); client intentionally noop |
| Heartbeats stop mid-run | Aggregation may have failed; check ISC aggregation history and Error-level logs |
| `WARN STALL` repeating | API queue bottleneck — see [Tune API performance](tune-api-performance.md) |
| Phases skip or end early | Compare `PHASE N … END` lines against [config-to-phases](../../reference/config-to-phases.md) |

---

## Related guides

| Topic | Guide |
| --- | --- |
| Queue tuning, heartbeat interval, HTTP 429 | [Tune API performance](tune-api-performance.md) |
| Proxy deployment | [Run the connector via proxy](run-via-proxy.md) |
| Common issues and recovery | [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md) |
