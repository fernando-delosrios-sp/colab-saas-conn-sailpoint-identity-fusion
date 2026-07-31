## Context

Identity Fusion NG external infrastructure writes operational artifacts to local disk on the proxy server:

- **Logs**: `fileLogSink.ts` appends to `LOG_FILE` or `logs/fusion-{YYYYMMDD}.log`
- **Recordings**: `recordingPaths.ts` resolves `recordings/{chainName}/`

Multi-tenant proxy deployments share one filesystem. Flat layouts cause collisions when two tenants use the same recording name or write logs on the same day.

Connection settings always include `baseurl` (e.g. `https://acme.api.identitynow.com`). `ReportService` already extracts a filesystem-safe hostname segment for dry-run reports — this change generalizes that pattern for log and recording roots.

Stakeholders: operators running shared proxy servers, developers using chain recording locally, maintainers of path helpers and external-logging tests.

## Goals / Non-Goals

**Goals:**

- Default log path: `logs/<tenant>/fusion-{YYYYMMDD}.log`
- Default recording path: `recordings/<tenant>/{chainName}/`
- Derive `<tenant>` from `config.baseurl` via shared sanitization helper
- Create tenant subdirectories automatically on first write
- Preserve `LOG_FILE` exact-path override
- Update specs, unit tests, chain fixtures, and operator documentation

**Non-Goals:**

- New ISC config field for tenant slug
- Migrating or symlinking existing flat `logs/` / `recordings/` artifacts
- Changing HTTP external-logging transport (ISC direct POST unchanged)
- Modifying standalone `log-server.js` default paths
- Env var `TENANT_SLUG` override (can be added later if needed)

## Decisions

### D1: Tenant slug source

- **Choice**: First label of `baseurl` hostname, sanitized (`acme.api.identitynow.com` → `acme`); fallback `unknown-tenant`
- **Reason**: Matches ISC tenant identity; no new config surface
- **Considered alternatives**: Source name (ambiguous across tenants); operator-entered slug (extra UI); full hostname (verbose, redundant domain segments)

### D2: Shared utility location

- **Choice**: Add `tenantSlugFromBaseurl(baseurl: string | undefined): string` in `src/utils/url.ts` (or dedicated `tenantPaths.ts` if url.ts grows too large)
- **Reason**: Single sanitization ruleset for logs, recordings, and future callers
- **Considered alternatives**: Private copy in each module (rejected — drift risk); refactor ReportService immediately (deferred — optional follow-up)

### D3: Log path composition

- **Choice**: `path.join('logs', tenantSlug, \`fusion-${YYYYMMDD}.log\`)` when `LOG_FILE` unset
- **Reason**: Satisfies `logs/<tenant>/` requirement; keeps daily rotation filename
- **Considered alternatives**: Flat file with tenant prefix (rejected — user requested directory structure)

### D4: Recording path composition

- **Choice**: `recordings/<tenant>/<chainName>/` for both absolute and repo-relative helpers in `recordingPaths.ts`
- **Reason**: Tenant isolation for chain artifacts; scenario.json relative paths update accordingly
- **Considered alternatives**: Tenant only in metadata (rejected — filesystem collision remains)

### D5: Passing baseurl into path resolvers

- **Choice**: `resolveLogFilePath(baseurl?, now?)` and `recordingChainDir(chainName, baseurl?)` accept optional baseurl; callers (`LogService`, recording store factory) pass `config.baseurl`
- **Reason**: Path functions stay pure; no global config singleton
- **Considered alternatives**: Read config from module-level import (rejected — harder to test)

### D6: LOG_FILE override

- **Choice**: When `process.env.LOG_FILE` is set, return it unchanged — no tenant injection
- **Reason**: Explicit operator path must not be altered
- **Considered alternatives**: Append tenant under LOG_FILE directory (rejected — surprising behavior)

### D7: Directory creation

- **Choice**: `fs.mkdir(..., { recursive: true })` before append/write (already in `appendLogLine`; extend to recording store init)
- **Reason**: First log/recording on a tenant must not fail
- **Considered alternatives**: Require pre-provisioned directories (rejected — ops burden)

### D8: Backward compatibility

- **Choice**: No legacy path fallback or migration tooling
- **Reason**: YAGNI; document path change; operators re-record or copy artifacts manually if needed
- **Considered alternatives**: Dual-read from old flat paths (rejected — complexity)

## Risks / Trade-offs

- **[Risk] Misconfigured or missing baseurl groups artifacts under `unknown-tenant`** → Mitigation: Document requirement; test-connection validates baseurl; log warning once per run when fallback used
- **[Risk] Existing automation expects flat `recordings/{chain}` paths** → Mitigation: Changelog + doc updates; `npm run test-recording` docs show new path pattern
- **[Risk] Sanitization edge cases (IP hosts, IPv6, custom domains)** → Mitigation: Reuse ReportService rules; unit tests for acme, IP, empty, invalid URL
- **[Trade-off] ReportService still uses private hostname helper** → Accepted: optional consolidation follow-up, not blocking

## Migration Plan

1. Deploy connector with tenant-scoped paths.
2. Operators on shared proxy hosts: no config change required — new runs write under `logs/<tenant>/` and `recordings/<tenant>/`.
3. Operators with explicit `LOG_FILE`: unchanged.
4. Developers with local flat recordings: re-record or move chains into tenant subfolder matching their dev `baseurl`.
5. Rollback: revert connector version; new tenant subdirs remain on disk but are ignored by older builds using flat paths.

## Open Questions

- None blocking — optional follow-up to deduplicate ReportService slug logic into shared utility.
