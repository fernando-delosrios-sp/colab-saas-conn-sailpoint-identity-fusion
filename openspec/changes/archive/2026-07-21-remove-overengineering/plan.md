# Remove Over-engineering Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Clean up over-engineered interfaces and unnecessary external dependencies.

**Architecture:** We are swapping `uuid` and `form-data` with native `crypto.randomUUID()` and `FormData`. We are deleting `WorkQueue` and `LockService` interfaces to use their concrete implementations directly (`FusionRun` and `InMemoryLockService`).

**Tech Stack:** TypeScript, Node.js

---

## Task 1: Remove form-data dependency

- [ ] **Step 1:** In `src/services/clientService/sdkApiAdapter.ts`, remove `import FormData from 'form-data'`.
- [ ] **Step 2:** In `sdkApiAdapter.ts`, remove the `this.config.formDataCtor = class extends FormData...` block entirely since the native FormData doesn't extend EventEmitter.
- [ ] **Step 3:** Run `npm uninstall form-data @types/form-data`.
- [ ] **Step 4:** Run `npm run typecheck` to verify the native FormData type is resolved.
- [ ] **Commit:** `refactor: replace form-data with native FormData`

## Task 2: Remove uuid dependency

- [ ] **Step 1:** Run grep to find all usages of `uuid`.
- [ ] **Step 2:** For each file, remove `import { v4 as uuidv4 } from 'uuid'`. Add `import crypto from 'crypto'`. Replace `uuidv4()` with `crypto.randomUUID()`.
- [ ] **Step 3:** Run `npm uninstall uuid @types/uuid`.
- [ ] **Step 4:** Run `npm run test` and `npm run typecheck`.
- [ ] **Commit:** `refactor: replace uuid with crypto.randomUUID()`

## Task 3: Remove WorkQueue interface

- [ ] **Step 1:** In `src/model/fusionRun.ts`, delete the `export interface WorkQueue { ... }` block.
- [ ] **Step 2:** In `src/model/fusionRun.ts`, change `export class FusionRun implements WorkQueue` to `export class FusionRun`.
- [ ] **Step 3:** Search for `WorkQueue` in `src/`. Replace any type annotations from `WorkQueue` to `FusionRun`.
- [ ] **Step 4:** Run `npm run typecheck`.
- [ ] **Commit:** `refactor: remove WorkQueue interface`

## Task 4: Remove LockService interface

- [ ] **Step 1:** In `src/services/lockService.ts`, delete `export interface LockService { ... }`.
- [ ] **Step 2:** In `src/services/lockService.ts`, change `export class InMemoryLockService implements LockService` to `export class InMemoryLockService`.
- [ ] **Step 3:** Search for `LockService` in `src/`. Update dependency injection type hints (e.g. `constructor(private lock: LockService)`) to `InMemoryLockService`.
- [ ] **Step 4:** Run `npm run typecheck`.
- [ ] **Commit:** `refactor: remove LockService interface`

## Task 5: Verification

- [ ] **Step 1:** Run `npm run test` to verify all unit tests pass.
- [ ] **Step 2:** Run `npm run lint` to ensure no unused imports remain.
