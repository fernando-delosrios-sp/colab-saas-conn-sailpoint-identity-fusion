## 1. Tooling Clampdown (Phase 1)
- [x] 1.1 Modify `eslint.config.mjs` to set `@typescript-eslint/no-unused-vars` to `error`.
- [x] 1.2 Modify `eslint.config.mjs` to set `no-explicit-any` and `@typescript-eslint/no-explicit-any` to `error`.
- [x] 1.3 Modify `eslint.config.mjs` to set `no-case-declarations` to `error`.
- [x] 1.4 Remove `log-server.js` and `scripts/` from the `ignores` list in `eslint.config.mjs`.

## 2. The Known Offender Purge (Phase 2)
- [x] 2.1 Remove `STATS_LOGGING_INTERVAL_MS` and other unused exports in `src/services/clientService/constants.ts`.
- [x] 2.2 Remove `getShortTimestamp` in `log-server.js`.
- [x] 2.3 Remove `isRecordMatchingEnabledForSource` in `src/services/fusionService/fusionService.ts`.
- [x] 2.4 Remove `_TOKEN_PATTERNS` in `src/services/attributeService/contextHelpers/dateUtils.ts`.

## 3. Linter Discovery & Cleanup (Phase 3)
- [x] 3.1 Run `npm run lint` and delete all newly discovered unused exports and unused variables.
- [x] 3.2 Fix all `no-case-declarations` errors by adding block scopes `{ }` to switch cases.
- [ ] 3.3 Replace any unsafe `any` usages with proper typings or `unknown`. (Punted: 1196 errors across 93 files require per-site type narrowing; see `openspec/changes/v/design.md` for follow-up scope.)
- [ ] 3.4 Ensure the codebase passes `npm run lint` and `npm test` successfully. (Blocked by 3.3.)
