# Brainstorming Log: External Settings Unification

## Context & Problem Statement

Identity Fusion NG exposes three related "external infrastructure" features across Advanced Settings today:

- **Proxy Settings** — delegate operation processing to an external host (`proxyEnabled`, `proxyUrl`, `proxyPassword`)
- **Developer Settings → External logging** — HTTP POST logs to a separate URL (`externalLoggingEnabled`, `externalLoggingUrl`, `externalLoggingLevel`)
- **Recording** — dev/CI only via env vars (`RECORD_MODE`, `RECORD_CHAIN_NAME`); not in connector-spec UI

These share a target host concept but are configured independently, use different field names, and have overlapping deployment patterns (proxy server + separate `log-server.js`). Operators must wire two URLs and run two processes for a common use case.

## Objectives

1. Unify proxy mode, external logging, and recording under **Advanced Settings → External Settings**.
2. Use **Enable external processing** as a config gateway that reveals shared target fields (URL + password) and sub-option toggles.
3. Clarify runtime behavior per sub-option, especially the split external-logging path (HTTP from ISC vs disk on proxy server).
4. Expose recording in ISC UI with a **recording name** when proxy + recording are enabled.
5. Drop old config key names — no migration or legacy aliases.

## Key Design Decisions & Alternatives

### Q1: What does "Enable external processing" mean?

- **Option A**: Implies proxy delegation is always on when enabled.
- **Option B**: Gateway only — reveals target URL/password and sub-options; behavior depends on toggles (**Chosen**).
- **Rationale**: Logging-only (no proxy) is a valid use case — ISC sends logs to external URL without delegating operations.

### Q2: Shared target URL — one field or separate paths?

- **Option A**: Single `externalTargetUrl` for all modes.
- **Option B**: Separate URLs per capability (status quo).
- **Chosen**: Option A — one URL; when proxy is off and logging is on, URL is the log endpoint; when proxy is on, URL is the operation endpoint.
- **Rationale**: Matches operator mental model of "my external infrastructure."

### Q3: Password usage?

- **Chosen**: Password required when proxy mode is on (client/server auth). **Ignored** when external logging sends HTTP POST from ISC (proxy off).
- **Rationale**: Current external logging has no auth; proxy requires shared secret.

### Q4: External logging when proxy is ON?

- **Option A**: ISC client POSTs logs to external URL (same as today).
- **Option B**: Logs written to disk on proxy server; ISC client does not external-log (**Chosen**).
- **Rationale**: Meaningful logs are emitted where processing runs (server). Proxy client only forwards — minimal log volume on ISC.
- **Disk path**: `LOG_FILE` env var (same as `log-server.js`), default `logs/fusion-{YYYYMMDD}.log`.

### Q5: External logging when proxy is OFF?

- **Chosen**: ISC connector HTTP POSTs plain-text log lines to `externalTargetUrl` (password ignored).
- **Rationale**: Centralized monitoring from cloud connector without proxy deployment.

### Q6: Recording scope and dependencies?

- **Chosen**: Recording sub-toggle requires proxy mode. Reveals **recording name** text field → maps to `recording.chainName`. Server runs record mode.
- **Rationale**: Recording writes to local filesystem; only meaningful on the processing host (proxy server).
- **Dev/CI**: Env vars (`RECORD_MODE`, etc.) remain for local workflows without ISC UI.

### Q7: Backward compatibility for renamed keys?

- **Option A**: Migrate `proxyEnabled` → `externalProxyEnabled`, alias old keys.
- **Option B**: Clean break — new keys only, update all runtime code (**Chosen**).
- **Rationale**: Explicit operator decision — no migration complexity.

### Q8: Embed log-server HTTP receiver on proxy server?

- **Option A**: Connector accepts log POSTs when in server mode.
- **Option B**: File sink only on server; no HTTP log receiver (**Chosen**).
- **Rationale**: User specified disk write on proxy server, not HTTP ingestion. `log-server.js` remains for HTTP-receiver use cases when proxy is off.

## Summary

Proceed with External Settings section: gateway toggle, shared URL/password, sub-options for proxy, recording (with name, proxy-required), and external logging (level). LogService routes by role: proxy-client noop, direct ISC → HTTP POST, proxy-server → file append. ProxyService reads new field names. No legacy key migration.
