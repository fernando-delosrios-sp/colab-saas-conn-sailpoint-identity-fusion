## Why

Proxy mode, external logging, and chain recording all target external infrastructure but live in separate Advanced Settings sections with unrelated field names (`proxyUrl` vs `externalLoggingUrl`) and no ISC UI for recording. Operators deploying a proxy server must configure two URLs and run a separate log-server process. Unifying these under External Settings with a shared target and clear sub-option behavior reduces configuration friction and matches how the features actually compose at runtime.

## What Changes

**External Settings section**
- From: Proxy Settings section + external logging in Developer Settings + recording via env vars only
- To: Advanced Settings → External Settings with gateway toggle, shared target URL/password, and sub-options (proxy, recording, logging)
- Reason: Single place for external infrastructure configuration
- Impact: Breaking — old config keys removed; operators reconfigure sources

**Enable external processing gateway**
- From: Each feature independently toggled in separate sections
- To: Master toggle reveals target fields and sub-options; no runtime effect until sub-options are enabled
- Reason: Clear UX — configure target once, choose capabilities
- Impact: Non-breaking conceptually; new UI structure

**External logging routing**
- From: Always HTTP POST to `externalLoggingUrl` when enabled
- To: Proxy off → HTTP POST to target URL (password ignored). Proxy on → append to disk on proxy server (`LOG_FILE` env or default path); ISC client does not external-log
- Reason: Logs belong where processing runs
- Impact: Behavior change when proxy + logging combined

**Recording in ISC UI**
- From: `RECORD_MODE` / `RECORD_CHAIN_NAME` env vars only
- To: Recording sub-toggle (requires proxy) + recording name field → `recording.chainName` on server
- Reason: Operators running proxy servers can name chains without env vars
- Impact: Non-breaking for dev/CI (env vars still work)

**Developer Settings cleanup**
- From: Includes external logging fields
- To: Reset/tuning fields only
- Reason: External logging moved to External Settings
- Impact: Non-breaking for non-logging users

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `proxy-service`: Read `externalProcessingEnabled`, `externalProxyEnabled`, `externalTargetUrl`, `externalTargetPassword`; proxy active only when gateway and proxy sub-option are on
- `log-service`: Role-aware external logging — HTTP POST (ISC direct), file sink (proxy server), noop (proxy client)
- `recording-service`: ISC-configured recording name drives chain name when gateway + proxy + recording enabled
- `documentation-site`: External Settings section replaces Proxy Settings and Developer external-logging docs

## Impact

- `connector-spec.json` — new External Settings section; remove Proxy Settings and Developer logging fields
- `src/model/config.ts` — `ExternalSettingsSection`; remove logging from `DeveloperSettingsSection`; remove `ProxySettingsSection`
- `src/data/config/settings/externalSettings.ts` — new reader with validation
- `src/data/config/settings/developerSettings.ts`, `proxySettings.ts` — strip/remove
- `src/data/config/readConfig.ts` — pipeline + recording bridge
- `src/services/proxyService.ts` — new config field names
- `src/services/logService/logService.ts` + `fileLogSink.ts` — dual sink
- `src/services/serviceRegistry.ts` — log role flags
- Tests, generated config docs, proxy-mode and observability guides
