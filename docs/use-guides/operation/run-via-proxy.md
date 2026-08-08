# Run the connector via proxy

Use this guide when you need to **execute connector logic on your own infrastructure** — VPN access, on-prem sources, data sovereignty, or local development with full filesystem access.

**Configuration reference:** [Advanced Settings — External Settings](../../configuration/advanced.md#external-settings) · **Architecture reference:** [Proxy deployment](../../reference/proxy-mode.md)

!!! note "Didactic guide"
    This page covers proxy deployment setup and ISC configuration. For Docker/Kubernetes examples, security details, and troubleshooting, see [Proxy deployment](../../reference/proxy-mode.md).

---

## When you need this

| Goal | What to enable |
| --- | --- |
| Process aggregations on your host instead of ISC | Proxy mode |
| Access local filesystem (reports, dry-run output) | Proxy server |
| Reach ISC from a restricted network | Proxy server with tunnel or reverse proxy |

Recording and external logging are separate goals — see [Capture scenarios for replay](capture-scenarios-for-replay.md) and [Monitor aggregation progress](monitor-aggregation-progress.md).

---

## External Settings roles

Enable **Enable external processing?** first — it reveals the shared target URL and password.

| Deployment | Proxy mode | Where work runs | Where logs go |
| --- | --- | --- | --- |
| **Direct ISC** (default) | Off | ISC platform | Optional HTTP POST (direct logging) |
| **Proxy client** (ISC forwards ops) | On | Your proxy server | Server owns logs |
| **Proxy server** (your host) | On (in forwarded config) | Your host | Disk append on server |

!!! note "Password semantics"
    **External target password** authenticates proxy requests between ISC (client) and your server. Set the same value in ISC and as `PROXY_PASSWORD` on the proxy host.

---

## Workflow: local proxy server

### 1. Start the proxy server

The repo ships a proxy server wrapper around the built connector.

```bash
npm run build
export PROXY_PASSWORD="your-shared-secret"
npm start
# Listens on http://localhost:3000 by default (override with PORT)
```

For local dev with ISC reachability, `npm run proxy` starts the server plus a tunnel. For production, expose a public HTTPS URL via reverse proxy or load balancer.

### 2. Configure ISC

1. Advanced Settings → **External Settings**
2. **Enable external processing?** — on
3. **External target URL** — your server URL (for example `https://fusion-proxy.example.com/`)
4. **External target password** — same as `PROXY_PASSWORD`
5. **Enable proxy mode?** — on
6. **Review and Test → Test Connection**

The ISC connector (client) POSTs `{ type, input, config }` to your server. The server runs the full connector and streams NDJSON results back. The client automatically sets `isProxy: true` in the forwarded config to prevent re-forwarding loops.

### 3. Verify and operate

- Confirm **Test Connection** succeeds from ISC
- Run account aggregation — processing occurs on the proxy host
- Enable disk logging on the server — see [Monitor aggregation progress](monitor-aggregation-progress.md)
- For dry-run or recording, include the appropriate flags in the operation `input` payload

---

## Common deployment patterns

| Scenario | Proxy | Also enable |
| --- | --- | --- |
| Production proxy with centralized logs | On | External logging on server (disk) |
| Local dev / debugging | On | Recording optional — see [Capture scenarios for replay](capture-scenarios-for-replay.md) |
| Direct ISC (no proxy) | Off | External logging via HTTP POST if needed |

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Test connection fails from ISC | Proxy URL reachable from ISC; HTTPS cert valid; passwords match |
| Operations timeout | Network path ISC → proxy; increase provisioning timeout — see [Tune API performance](tune-api-performance.md) |
| No logs in ISC | Expected — proxy client does not ship logs; check server disk logs |
| Re-forwarding loop | Server should receive `isProxy: true` in config |

More detail: [Proxy deployment — Troubleshooting](../../reference/proxy-mode.md#troubleshooting) · [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md)

---

## Related guides

| Topic | Guide |
| --- | --- |
| External logging on proxy server | [Monitor aggregation progress](monitor-aggregation-progress.md) |
| Scenario recording (requires proxy server) | [Capture scenarios for replay](capture-scenarios-for-replay.md) |
| Dry-run on proxy host | [Analyze changes with dry-run](analyze-with-dry-run.md) |
