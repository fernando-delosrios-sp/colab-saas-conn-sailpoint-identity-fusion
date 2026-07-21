# Refactor Unique Attributes Output Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Refactor unique attribute generation to be evaluated Just-In-Time (JIT) during the aggregation output stream instead of as an early-send pipeline phase.

**Architecture:** We are removing the explicit `uniqueAttributesPhase` (Phase 5) from the `corePipeline`. Unique attribute generation will move into the `outputPhase` (Phase 6), inside the `sendAccountsToPlatform` logic. This ensures a uniform output path for all Fusion accounts while strictly maintaining Out-Of-Memory (OOM) protection by clearing accounts immediately after they stream. The refactor carefully avoids polluting dry-run execution with uniqueness generation side-effects.

**Tech Stack:** TypeScript, SailPoint ISC Connector SDK

---

## Task 1: Modify FusionService

- [ ] **Step 1:** In `src/services/fusionService/fusionService.ts`, delete the `streamAndClearEligibleAccounts` function.
- [ ] **Step 2:** Locate the iteration block where `sendAccountsToPlatform` actually fetches from the underlying `listISCAccounts` / `forEachISCAccount`.
- [ ] **Step 3:** Inject a pre-serialization hook inside `sendAccountsToPlatform` that checks `needsRefresh`. If true, call `this.definitionService.refreshUniqueAttributes(account)`. This must happen synchronously prior to serialization, ensuring accounts are instantly evaluated and then pushed to the output stream.

## Task 2: Refactor Core Pipeline

- [ ] **Step 1:** Open `src/operations/helpers/corePipeline.ts`.
- [ ] **Step 2:** Delete the `uniqueAttributesPhase` function.
- [ ] **Step 3:** Remove the invocation of `uniqueAttributesPhase` from `runCorePipeline`.
- [ ] **Step 4:** Ensure `outputPhase` successfully streams all accounts, now inclusive of the JIT generation logic implemented in Task 1.

## Task 3: Clean up Test Suites

- [ ] **Step 1:** Run `npm run test:watch src/operations/helpers/__tests__/corePipeline.test.ts`. Remove references to `uniqueAttributesPhase` or `streamAndClearEligibleAccounts` mocks.
- [ ] **Step 2:** Run `npm run test:watch src/services/fusionService/__tests__/fusionService.test.ts`. Update tests to expect unique attributes generation to occur during `sendAccountsToPlatform`.
- [ ] **Step 3:** Verify dry-run tests `npm test` still pass and confirm they do not unintentionally mutate `needsRefresh` or trigger definition service logic.

## Task 4: Documentation

- [ ] **Step 1:** Update `src/operations/helpers/corePipeline.ts` inline comments: remove phase 5/6 split discussion, update phase numbers (e.g., Phase 6 becomes Phase 5 if re-numbered, or just note phase 5 is merged into output).
- [ ] **Step 2:** Commit all changes with "refactor: unify output stream and evaluate unique attributes JIT".
