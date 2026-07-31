# Tenant-Scoped Logs and Recordings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partition default external log and recording artifact paths by ISC tenant slug derived from `baseurl`, enabling multi-tenant isolation on shared proxy hosts.

**Architecture:** Add a shared `tenantSlugFromBaseurl` helper in `src/utils/`. Extend `fileLogSink.resolveLogFilePath` and `recordingPaths.recordingChainDir*` to insert `/<tenant>/` under `logs/` and `recordings/` roots. Thread `config.baseurl` from `LogService` and recording store factories. Preserve exact `LOG_FILE` override. Recursive mkdir before first write.

**Tech Stack:** TypeScript, Node.js, Vitest, fs/promises, path

## Global Constraints

- Requirement sentences in specs use SHALL/MUST — implementation must satisfy delta specs in this change directory
- No new ISC config fields; tenant derived from existing `baseurl`
- `LOG_FILE` env override MUST NOT be altered by tenant injection
- Fallback slug: `unknown-tenant`
- No migration of legacy flat-path artifacts

---

## Task 1: Tenant slug utility

**Files:**
- Modify: `src/utils/url.ts`
- Create/Modify: `src/utils/__tests__/url.test.ts`

- [ ] **Step 1:** Write failing tests for `tenantSlugFromBaseurl`:
  - `https://acme.api.identitynow.com` → `acme`
  - `https://10.0.0.1/api` → sanitized IP segment
  - `''` / invalid → `unknown-tenant`

- [ ] **Step 2:** Run test file — verify failures

- [ ] **Step 3:** Implement `tenantSlugFromBaseurl` using hostname first-label extraction and filesystem-safe sanitization (port ReportService rules)

- [ ] **Step 4:** Run tests — verify pass

- [ ] **Step 5:** Commit: `feat(utils): add tenantSlugFromBaseurl for artifact paths`

---

## Task 2: Tenant-scoped log paths

**Files:**
- Modify: `src/services/logService/fileLogSink.ts`
- Modify: `src/services/logService/logService.ts`
- Modify: `src/services/logService/__tests__/externalLoggingRouting.test.ts`

- [ ] **Step 1:** Update tests — proxy server default path expects `logs/acme/fusion-YYYYMMDD.log` when baseurl is `https://acme.api.identitynow.com`

- [ ] **Step 2:** Run tests — verify failures

- [ ] **Step 3:** Change `resolveLogFilePath(baseurl?, now?)` — when `LOG_FILE` unset, return `logs/${tenantSlugFromBaseurl(baseurl)}/fusion-${date}.log`

- [ ] **Step 4:** Update `appendLogLine` signature to accept baseurl; pass from `LogService` external log sink path

- [ ] **Step 5:** Add test for `unknown-tenant` fallback and confirm `LOG_FILE` test still passes unchanged

- [ ] **Step 6:** Run `npx vitest run src/services/logService/__tests__/externalLoggingRouting.test.ts`

- [ ] **Step 7:** Commit: `feat(log): tenant-scoped default external log paths`

---

## Task 3: Tenant-scoped recording paths

**Files:**
- Modify: `src/data/recordingPaths.ts`
- Modify: `src/services/recordingService/ndjsonRecordingStore.ts`
- Modify: `src/services/recordingService/recordingStore.ts`
- Modify: `src/services/serviceRegistry.ts`
- Modify: chain test fixtures under `src/operations/__tests__/chain/`

- [ ] **Step 1:** Write failing test for `recordingChainDir('my-chain', 'https://acme.api.identitynow.com')` → ends with `recordings/acme/my-chain`

- [ ] **Step 2:** Run test — verify failure

- [ ] **Step 3:** Update `recordingChainDir` and `recordingChainDirRelative` to accept optional baseurl and insert tenant segment

- [ ] **Step 4:** Thread baseurl through store constructors and `ServiceRegistry` recording init

- [ ] **Step 5:** Ensure `NdjsonRecordingStore` mkdir tenant chain dir on init

- [ ] **Step 6:** Update `minimalRecordingFixture.ts` and dependent chain tests to pass baseurl (use `https://example.identitynow.com` or fixture-specific tenant)

- [ ] **Step 7:** Run recording-related tests: `npx vitest run src/data src/services/recordingService src/operations/__tests__/chain`

- [ ] **Step 8:** Commit: `feat(recording): tenant-scoped chain artifact directories`

---

## Task 4: Scripts

**Files:**
- Modify: `scripts/record-chain.js`

- [ ] **Step 1:** Update console log line to print tenant-scoped path when baseurl available (read from env/config if script has access; otherwise document pattern in message)

- [ ] **Step 2:** Commit: `docs(scripts): update record-chain path hint for tenant layout`

---

## Task 5: Documentation

**Files:**
- Modify: `docs/reference/proxy-mode.md`
- Modify: `docs/reference/chain-recording.md`
- Modify: `docs/use-guides/operation/connection-and-observability-tuning.md`

- [ ] **Step 1:** Replace flat path references with tenant-scoped paths per documentation-site delta spec

- [ ] **Step 2:** Note `unknown-tenant` fallback and `LOG_FILE` override behavior

- [ ] **Step 3:** Commit: `docs: tenant-scoped logs and recordings paths`

---

## Task 6: Changelog and verification

- [ ] **Step 1:** Run `npm run lint`

- [ ] **Step 2:** Run targeted test suite for log + recording + chain modules

- [ ] **Step 3:** Add CHANGELOG entry describing path change for shared proxy operators

- [ ] **Step 4:** Commit: `chore: changelog for tenant-scoped artifact paths`

---

## Verification checklist (maps to verify.md)

| Spec scenario | Test / check |
|---------------|--------------|
| log-service: tenant-scoped disk path | `externalLoggingRouting.test.ts` |
| log-service: unknown-tenant fallback | `externalLoggingRouting.test.ts` |
| log-service: LOG_FILE unchanged | `externalLoggingRouting.test.ts` |
| log-service: slug helper | `url.test.ts` |
| recording-service: record under tenant dir | recording path unit test |
| recording-service: no chain name collision | recording path unit test |
| recording-service: replay tenant path | chain replay fixture test |
| documentation-site: proxy-mode path | manual read `docs/reference/proxy-mode.md` |
