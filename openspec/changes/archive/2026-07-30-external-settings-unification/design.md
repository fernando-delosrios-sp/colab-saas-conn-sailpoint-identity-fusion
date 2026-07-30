## Context

Identity Fusion NG supports three external-infrastructure capabilities today:

| Capability | Config location | Runtime |
|------------|-----------------|---------|
| Proxy mode | Advanced → Proxy Settings | ISC client forwards ops; server processes with `PROXY_PASSWORD` |
| External logging | Advanced → Developer Settings | `LogService` HTTP POST to configured URL |
| Recording | Env vars only | `RecordingService` on processing host |

Proxy and logging use different URLs. Recording is invisible in ISC UI. A standalone `log-server.js` receives HTTP logs when operators want centralized log capture.

Stakeholders: operators deploying proxy servers, developers using chain recording, and maintainers of config readers and `LogService`.

## Goals / Non-Goals

**Goals:**

- Add External Settings section with gateway toggle and shared target (URL + password).
- Sub-options: proxy mode, recording (with name, proxy-required), external logging (with level).
- Implement role-aware external logging (HTTP / disk / noop).
- Wire ISC recording name to `recording.chainName` when gateway + proxy + recording enabled.
- Remove old config keys; update all runtime code to new names.
- Regenerate config docs and update proxy/observability guides.

**Non-Goals:**

- Backward-compat migration or legacy key aliases for renamed options.
- Embedding HTTP log receiver in connector server mode (disk sink only when proxy + logging).
- Changing proxy forwarding protocol or response format.
- Exposing replay mode in ISC UI (remains env/dev tooling).

## Decisions

### D1: Gateway semantics

- **Choice**: `externalProcessingEnabled` reveals target fields and sub-options; inactive when off regardless of stored sub-toggle values.
- **Reason**: User-defined gateway — not synonymous with proxy.
- **Alternatives**: Gateway auto-enables proxy (rejected — blocks logging-only).

### D2: Shared target URL

- **Choice**: Single `externalTargetUrl` — proxy endpoint when proxy on; log HTTP endpoint when proxy off and logging on.
- **Reason**: One external infrastructure host.
- **Alternatives**: Separate URLs per capability (rejected — current pain point).

### D3: Password scope

- **Choice**: Required when proxy on; ignored for HTTP external logging from ISC.
- **Reason**: Matches existing proxy auth vs log-server no-auth patterns.

### D4: External logging on proxy server

- **Choice**: Append plain-text lines to `process.env.LOG_FILE ?? logs/fusion-{YYYYMMDD}.log` via `fileLogSink.ts` (sanitize logic from `log-server.js`).
- **Reason**: User chose LOG_FILE env pattern; no HTTP receiver on server.
- **Alternatives**: POST logs back through proxy URL (rejected — wrong transport).

### D5: External logging on proxy client (ISC)

- **Choice**: No external logging when `isProxyMode()` — server owns logs.
- **Reason**: Client has minimal operational log volume during forward-only execution.

### D6: Recording bridge

- **Choice**: When `externalProcessingEnabled && externalProxyEnabled && externalRecordingEnabled`, set `recording.mode = 'record'` and `recording.chainName = recordingName` in `readConfig` after `resolveRecordingConfig`. Env vars retain precedence for dev/CI.
- **Reason**: Server receives full config via proxy forward; `ServiceRegistry` already wires `RecordingService` from `config.recording`.

### D7: No legacy key migration

- **Choice**: Delete `proxyEnabled`, `proxyUrl`, `proxyPassword`, `externalLoggingUrl`; use new keys only.
- **Reason**: Explicit operator decision from planning session.

### D8: connector-spec parentKey chain

```
externalProcessingEnabled
├── externalTargetUrl, externalTargetPassword
├── externalProxyEnabled
│   └── externalRecordingEnabled
│       └── recordingName
└── externalLoggingEnabled
    └── externalLoggingLevel
```

## Risks / Trade-offs

- **[Risk] Breaking config for existing sources** → Mitigation: Document in changelog; operators re-save External Settings.
- **[Risk] Split URL deployments today** → Mitigation: Single URL going forward; operators with different proxy vs log URLs must pick one or run log-server separately for HTTP-only path.
- **[Risk] Disk log path collisions on shared server** → Mitigation: `LOG_FILE` env for explicit path; date suffix in default.
- **[Trade-off] Recording not available without proxy in ISC UI** → Accepted: filesystem constraint; env vars still work locally.

## Migration Plan

1. Deploy connector with new connector-spec section.
2. Operators reconfigure sources: enable External processing, set target URL/password, enable desired sub-options.
3. Remove references to old keys from docs and defaults.
4. Rollback: revert connector version; old keys won't auto-map — manual reconfig required.

## Open Questions

- Should `externalTargetUrl` allow path suffixes (e.g. `https://host/fusion`)? **Proposed: yes — full URL field, same as today.**
- Default log file naming when `LOG_FILE` unset? **Proposed: `logs/fusion-{YYYYMMDD}.log`.**
