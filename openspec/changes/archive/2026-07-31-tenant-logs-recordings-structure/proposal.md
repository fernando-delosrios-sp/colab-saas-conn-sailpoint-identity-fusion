## Why

External logging and recording on a shared proxy server currently write to flat `logs/` and `recordings/` directories. When one host processes multiple ISC tenants, log files and chain artifacts overwrite or commingle, making troubleshooting and golden-chain verification unreliable. Operators must hand-configure `LOG_FILE` or custom layouts to get isolation. Tenant-scoped paths align with how ISC identifies environments (`baseurl`) and match the dry-run report naming pattern already in the codebase.

## What Changes

**Default external log path (proxy server)**
- From: `logs/fusion-{YYYYMMDD}.log` when `LOG_FILE` is unset
- To: `logs/<tenant>/fusion-{YYYYMMDD}.log` where `<tenant>` is derived from connection `baseurl`
- Reason: Isolate log streams per tenant on shared infrastructure
- Impact: Non-breaking for operators using explicit `LOG_FILE`; default-path operators see new subdirectory layout

**Default recording chain directory**
- From: `recordings/{chainName}/`
- To: `recordings/<tenant>/{chainName}/`
- Reason: Prevent chain-name collisions across tenants on the same proxy host
- Impact: Non-breaking for env-driven local dev when `baseurl` is set in config; existing flat recordings are not migrated automatically

**Tenant slug derivation**
- From: No tenant segment in artifact paths
- To: Shared helper extracts filesystem-safe slug from `config.baseurl` (first hostname label); fallback `unknown-tenant`
- Reason: Reuse connection settings without new ISC UI fields
- Impact: Internal utility addition; tests must cover slug sanitization and fallbacks

## Capabilities

### New Capabilities

(none — behavior extends existing log and recording capabilities)

### Modified Capabilities

- `log-service`: Default disk log path on proxy server MUST include tenant subdirectory; `LOG_FILE` override semantics unchanged
- `recording-service`: Chain artifact directories MUST be rooted under `recordings/<tenant>/`
- `documentation-site`: Reference docs for proxy logging paths and chain recording layout MUST describe tenant-scoped directories

## Impact

- **Code**: `src/services/logService/fileLogSink.ts`, `src/data/recordingPaths.ts`, new or extended tenant slug utility under `src/utils/`, `LogService` wiring for `baseurl`, recording store consumers, test fixtures under `src/operations/__tests__/chain/`
- **Scripts**: `scripts/record-chain.js` console output path hints
- **Docs**: `docs/reference/proxy-mode.md`, `docs/reference/chain-recording.md`, `docs/use-guides/operation/connection-and-observability-tuning.md`
- **Tests**: `externalLoggingRouting.test.ts`, recording path tests, chain replay fixtures
- **Operators**: Shared proxy deployments gain per-tenant isolation; changelog entry required for path change
