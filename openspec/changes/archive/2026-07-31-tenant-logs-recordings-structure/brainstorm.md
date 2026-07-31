# Brainstorming Log: Tenant-Scoped Logs and Recordings

## Context & Problem Statement

External Settings unification (2026-07-30) introduced role-aware external logging and ISC-driven recording on the proxy server. Disk paths today are flat:

| Artifact | Current default path |
|----------|---------------------|
| External logs (proxy server) | `logs/fusion-{YYYYMMDD}.log` |
| Chain recordings | `recordings/{chainName}/` |

When one proxy host serves multiple ISC tenants, logs and recordings collide in shared directories. Operators cannot isolate artifacts per tenant without manual `LOG_FILE` overrides or custom deployment layouts.

`ReportService` already derives a filesystem-safe tenant segment from `config.baseurl` (first hostname label, e.g. `acme` from `acme.api.identitynow.com`) for dry-run HTML reports — the same pattern applies here.

## Objectives

1. Partition default log and recording paths by tenant: `logs/<tenant>/` and `recordings/<tenant>/`.
2. Derive `<tenant>` from connection `baseurl` at runtime (no new ISC config field).
3. Preserve explicit overrides: `LOG_FILE` env still wins for logs; env-based local dev recording keeps working.
4. Auto-create tenant subdirectories on first write (`mkdir -p` semantics).
5. Update specs, tests, and operator docs to reflect new layout.

## Key Design Decisions & Alternatives

### Q1: How is `<tenant>` determined?

- **Option A**: New ISC config field `tenantSlug` (operator-entered).
- **Option B**: Derive from `config.baseurl` hostname first label, sanitized (**Chosen**).
- **Option C**: Derive from source name or source ID.
- **Rationale**: `baseurl` is always present in connection settings, matches ISC tenant identity, and mirrors existing `ReportService.hostnameSegmentFromBaseurl` behavior. No UI change required.

### Q2: What is the default log file path on proxy server?

- **Option A**: `logs/<tenant>/fusion-{YYYYMMDD}.log` (**Chosen**).
- **Option B**: `logs/<tenant>/{YYYYMMDD}.log` (drop fusion prefix).
- **Option C**: Keep flat `logs/fusion-{YYYYMMDD}.log` and add tenant as filename prefix.
- **Rationale**: Directory partition matches user request; date-suffixed filename preserves daily rotation pattern.

### Q3: What is the default recording chain path?

- **Option A**: `recordings/<tenant>/{chainName}/` (**Chosen**).
- **Option B**: `recordings/{chainName}/` with tenant metadata in scenario.json only.
- **Rationale**: Aligns with user request; keeps chain names tenant-local (same chain name on two tenants no longer collides).

### Q4: Behavior when `LOG_FILE` is set?

- **Option A**: Honor `LOG_FILE` exactly — no tenant injection (**Chosen**).
- **Option B**: Treat `LOG_FILE` as directory and append tenant + filename.
- **Rationale**: Explicit operator override should not surprise; matches current semantics.

### Q5: Fallback when `baseurl` is missing or unparseable?

- **Option A**: Use `unknown-tenant` segment (**Chosen**, consistent with ReportService `unknown-host`).
- **Option B**: Fail fast — refuse to write logs/recordings.
- **Rationale**: Local tests and misconfigured dev runs should degrade gracefully, not block operations.

### Q6: Shared utility vs duplicated logic?

- **Option A**: Extract `tenantSlugFromBaseurl(baseurl)` to `src/utils/url.ts` (or `src/utils/tenantPaths.ts`) and reuse from log + recording paths (**Chosen**).
- **Option B**: Duplicate sanitization in `fileLogSink.ts` and `recordingPaths.ts`.
- **Rationale**: Single source of truth; ReportService logic can migrate to shared helper later (optional follow-up).

### Q7: Backward compatibility for existing flat artifacts?

- **Option A**: Clean break — new paths only; no automatic migration (**Chosen**).
- **Option B**: Fall back to legacy flat path when tenant subdir absent and chain exists at old location.
- **Rationale**: Simpler implementation; operators on shared servers get isolation immediately; local dev re-records if needed. Document path change in changelog.

### Q8: Local dev / CI without real tenant URL?

- **Option A**: Use derived slug from config `baseurl` in forwarded/test config (tests already set `baseurl`) (**Chosen**).
- **Option B**: Env var `TENANT_SLUG` override for dev.
- **Rationale**: Tests and `npm run dev` configs already include `baseurl`; extra env var is YAGNI unless requested later.

### Q9: Documentation scope?

- **Chosen**: Update proxy-mode reference, connection/observability tuning guide, chain-recording reference, and generated config docs if paths are mentioned.
- **Non-goal**: Rewriting log-server.js (standalone HTTP receiver) — out of scope unless operator wants parity later.

## Summary

Proceed with tenant-scoped directory layout derived from `baseurl`. Default paths: `logs/<tenant>/fusion-{YYYYMMDD}.log` and `recordings/<tenant>/{chainName}/`. Shared slug helper, recursive mkdir on write, `LOG_FILE` override unchanged, `unknown-tenant` fallback. Modify `log-service` and `recording-service` specs; update tests and docs. No new ISC config fields.
