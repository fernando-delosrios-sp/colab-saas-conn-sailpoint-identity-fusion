## 1. Remove form-data dependency

- [x] 1.1 Find all imports of `form-data` and replace with global `FormData`.
- [x] 1.2 Update `sdkApiAdapter.ts` to remove the `setMaxListeners` hack from the custom `FormData` constructor.
- [x] 1.3 Uninstall `form-data` and `@types/form-data` (if present) from `package.json`.

## 2. Remove uuid dependency

- [x] 2.1 Find all imports of `uuid` (e.g. `v4 as uuidv4`).
- [x] 2.2 Replace UUID generation with `crypto.randomUUID()`. Add `import crypto from 'crypto'` if needed.
- [x] 2.3 Uninstall `uuid` and `@types/uuid` from `package.json`.

## 3. Remove WorkQueue interface

- [x] 3.1 Delete `WorkQueue` interface definition from `src/model/fusionRun.ts`.
- [x] 3.2 Update `FusionRun` class to remove `implements WorkQueue`.
- [x] 3.3 Replace any type references to `WorkQueue` with `FusionRun` throughout the codebase.

## 4. Remove LockService interface

- [x] 4.1 Delete `LockService` interface definition from `src/services/lockService.ts`.
- [x] 4.2 Update `InMemoryLockService` class to remove `implements LockService`.
- [x] 4.3 Replace any type references to `LockService` (e.g., in dependency injection) with `InMemoryLockService`.

## 5. Verification and Cleanup

- [x] 5.1 Run `npm run test` to ensure no behavior changed.
- [x] 5.2 Run `npm run typecheck` to verify no lingering interface references.
- [x] 5.3 Run `npm run lint` to catch any unused imports.
- [x] 5.4 Ensure any relevant developer comments mentioning these interfaces are updated.
