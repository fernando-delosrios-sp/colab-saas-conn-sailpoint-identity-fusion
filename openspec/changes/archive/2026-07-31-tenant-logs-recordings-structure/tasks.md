## 1. Tenant slug utility

- [x] 1.1 Add `tenantSlugFromBaseurl(baseurl)` to `src/utils/url.ts` (or `src/utils/tenantPaths.ts`) with sanitization aligned to ReportService hostname rules
- [x] 1.2 Add unit tests in `src/utils/__tests__/url.test.ts` (or dedicated test file) covering standard ISC URL, IP host, empty/invalid URL, and fallback `unknown-tenant`

## 2. Tenant-scoped log paths

- [x] 2.1 Update `resolveLogFilePath` in `src/services/logService/fileLogSink.ts` to accept optional `baseurl` and return `logs/<tenant>/fusion-{YYYYMMDD}.log` when `LOG_FILE` is unset
- [x] 2.2 Pass `config.baseurl` from `LogService` into `appendLogLine` / `resolveLogFilePath`
- [x] 2.3 Update `src/services/logService/__tests__/externalLoggingRouting.test.ts` for tenant-scoped default path and unchanged `LOG_FILE` override
- [x] 2.4 Add scenario test for `unknown-tenant` fallback when baseurl missing

## 3. Tenant-scoped recording paths

- [x] 3.1 Update `src/data/recordingPaths.ts` — `RECORDINGS_DIR` stays root; `recordingChainDir(chainName, baseurl?)` and `recordingChainDirRelative(chainName, baseurl?)` include tenant segment
- [x] 3.2 Thread `baseurl` through `NdjsonRecordingStore`, `createRecordingStore`, `getOrCreateRecordingStore`, and `ServiceRegistry` recording wiring
- [x] 3.3 Ensure recording store creates tenant subdirectory before first write
- [x] 3.4 Update chain test fixtures (`minimalRecordingFixture.ts`, `test-recording.script.test.ts`, etc.) to use tenant-scoped paths
- [x] 3.5 Add unit tests for recording path resolution (two tenants, same chain name, no collision)

## 4. Scripts and integration smoke

- [x] 4.1 Update `scripts/record-chain.js` console output to show `recordings/<tenant>/{chainName}/` pattern
- [x] 4.2 Run targeted tests: `externalLoggingRouting.test.ts`, recording path tests, chain replay fixtures

## 5. Documentation

- [x] 5.1 Update `docs/reference/proxy-mode.md` — default log path `logs/<tenant>/fusion-{YYYYMMDD}.log`
- [x] 5.2 Update `docs/reference/chain-recording.md` — `recordings/<tenant>/{chainName}/` layout
- [x] 5.3 Update `docs/use-guides/operation/connection-and-observability-tuning.md` — tenant isolation and `unknown-tenant` fallback
- [x] 5.4 Update inline JSDoc on `fileLogSink.ts` and `recordingPaths.ts` for new path semantics

## 6. Changelog

- [x] 6.1 Create or update the project changelog entry for tenant-scoped log and recording paths (apply will invoke **changelog-generator** if available)
- [x] 6.2 Confirm the entry covers user-visible path changes for shared proxy deployments
