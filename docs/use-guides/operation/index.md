# Operation guides

Use these guides after configuration is in place and you are running or tuning aggregations in production, development, or CI.

Each guide has one practical goal. For field keys, types, defaults, and constraints, use the linked **Configuration** and **Technical reference** pages.

## Choose your path

| Your goal | Start here | Also read |
| --- | --- | --- |
| **Know if an aggregation is healthy** | [Monitor aggregation progress](monitor-aggregation-progress.md) | [Config to account-list phases](../../reference/config-to-phases.md) · [Observability](../../reference/observability.md) |
| **Fix slow runs, HTTP 429, or timeouts** | [Tune API performance](tune-api-performance.md) | [Monitor aggregation progress](monitor-aggregation-progress.md) |
| **Validate Match or mapping before production** | [Analyze changes with dry-run](analyze-with-dry-run.md) | [Match tuning cookbooks](../configuration/match-tuning-cookbooks.md) |
| **Run connector logic on your infrastructure** | [Run the connector via proxy](run-via-proxy.md) | [Monitor aggregation progress](monitor-aggregation-progress.md) |
| **Record and replay API traffic for regression** | [Capture scenarios for replay](capture-scenarios-for-replay.md) | [Testing and validation](../validation-and-troubleshooting/testing-and-validation.md) |
| **Rebuild accounts or clear review forms** | [Reset Fusion state](reset-fusion-state.md) | [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md) |

## Reading order

If you prefer to read top to bottom, follow this sequence — each step builds on the previous:

1. **[Monitor aggregation progress](monitor-aggregation-progress.md)** — external logging and log-based health checks
2. **[Tune API performance](tune-api-performance.md)** — queue, retry, and timeout tuning
3. **[Analyze changes with dry-run](analyze-with-dry-run.md)** — non-persistent validation before config changes
4. **[Run the connector via proxy](run-via-proxy.md)** — self-hosted processing
5. **[Capture scenarios for replay](capture-scenarios-for-replay.md)** — regression recording and CI replay
6. **[Reset Fusion state](reset-fusion-state.md)** — recovery when you need a clean rebuild

For first-time setup, start with [Getting started](../../getting-started/index.md). For configuration, see [Configuration guides overview](../configuration/index.md).

