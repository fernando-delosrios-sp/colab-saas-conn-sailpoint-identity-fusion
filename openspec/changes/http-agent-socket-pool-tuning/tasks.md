## 1. HTTPS agent pool configuration

- [x] 1.1 In `src/services/clientService/sdkApiAdapter.ts`, replace bare `{ keepAlive: true }` with explicit pool bounds: `keepAliveMsecs: 30000`, `maxSockets: 50`, `maxFreeSockets: 10`, `timeout: 60000`
- [x] 1.2 Update the constructor comment to describe keep-alive and connection pool bounds (not just keep-alive)
- [x] 1.3 Add `sdkApiAdapter.test.ts` covering bounded agent options and shared Configuration wiring

## 2. Verification

- [x] 2.1 Run type check: `npx tsc --noEmit`
- [x] 2.2 Run client service tests: `npm test -- src/services/clientService/__tests__/`
- [x] 2.3 Run full test suite: `npm test`
- [x] 2.4 Run lint: `npm run lint`

## 3. Documentation

- [x] 3.1 Confirm no user-facing README or config docs require updates (internal transport tuning only)
